// src/inpage.ts
(() => {
  // Duplicate injection kontrolü
  if ((window as any).__AEGIS_INPAGE_LOADED) {
    console.log("[Aegis/inpage] Already loaded, skipping");
    return;
  }
  (window as any).__AEGIS_INPAGE_LOADED = true;
  
  console.log("[Aegis/inpage] init", location.href);

  // Selector sabitleri (kullanılmıyor ama referans için bırakıldı)
  // const APPROVE = "0x095ea7b3";             // approve(address,uint256)
  // const SET_APPROVAL_FOR_ALL = "0xa22cb465"; // setApprovalForAll(address,bool)
  // const PERMIT_PREFIXES = ["0xd505accf", "0x8fcbaf0c"]; // yaygın permit selector'ları

  // Hook'lanan provider'ları takip etmek için
  const HOOKED = new WeakSet<any>();
  const ORIGINALS = new WeakMap<any, Function>(); // provider -> orijinal request
  const LAST_SIG = new WeakMap<any, string>();     // provider -> request.toString() imzası (değişirse yeniden hook)
  
  // Takip edilen adresleri al
  let trackedAddresses: string[] = [];
  async function getTrackedAddresses() {
    return new Promise<string[]>((resolve) => {
      try {
        chrome.storage.local.get({ addresses: [] }, (res) => {
          trackedAddresses = (res.addresses || []).map((addr: string) => addr.toLowerCase());
          console.log("[Aegis/inpage] Tracked addresses:", trackedAddresses);
          resolve(trackedAddresses);
        });
      } catch (e) {
        console.error("[Aegis/inpage] Chrome storage error:", e);
        resolve([]);
      }
    });
  }
  
  // Contract verification kontrolü
  async function checkContractVerification(contractAddress: string): Promise<boolean> {
    try {
      // Etherscan API ile contract verification kontrolü
      const response = await fetch(`https://api-sepolia.etherscan.io/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=YourApiKey`);
      const data = await response.json();
      
      if (data.status === '1' && data.result && data.result[0]) {
        const contractInfo = data.result[0];
        const isVerified = contractInfo.SourceCode && contractInfo.SourceCode !== '';
        console.log(`[Aegis/inpage] Contract ${contractAddress} verification status:`, isVerified);
        return isVerified;
      }
      return false;
    } catch (e) {
      console.error("[Aegis/inpage] Contract verification check error:", e);
      return false;
    }
  }

  // Yardımcılar
  function short(a?: string) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : "unknown"; }
  function post(type: string, payload: any) {
    const packet = { target: "AegisInpage", type, payload, address: payload?.address };
    console.log("[Aegis/inpage] post:", type, payload);
    
    // Kanal 1: window.postMessage
    try {
      window.postMessage(packet, "*");
    } catch (e) {
      console.error("[Aegis/inpage] postMessage error:", e);
    }
    
    // Kanal 2: DOM CustomEvent (iframe sandbox yedeği)
    try { 
      document.dispatchEvent(new CustomEvent("AegisInpageEvent", { detail: packet })); 
    } catch (e) {
      console.error("[Aegis/inpage] CustomEvent error:", e);
    }
  }

  // Bir provider'ı güvenli şekilde hook'la
  function hookProvider(provider: any, label = "unknown") {
    if (!provider || typeof provider.request !== "function") {
      console.log(`[Aegis/inpage] Skipping ${label}: not a valid provider`);
      return;
    }

    // Aynı provider daha önce hook'landıysa ve signature değişmediyse tekrar etme
    const sig = provider.request.toString();
    if (HOOKED.has(provider) && LAST_SIG.get(provider) === sig) {
      // console.log(`[Aegis/inpage] Provider ${label} already hooked`); // Spam log'u kaldırıldı
      return;
    }
    
    console.log(`[Aegis/inpage] Hooking provider: ${label}`, provider);

    // Orijinali sakla
    const orig = provider.request.bind(provider);
    ORIGINALS.set(provider, orig);

    const proxy = new Proxy(orig, {
      apply: async (target, thisArg, argArray: any[]) => {
        const args = argArray?.[0] || {};
        try {
          // 1) İşlem gönderimi
          if (args?.method === "eth_sendTransaction" && Array.isArray(args.params) && args.params[0]) {
            const tx = args.params[0] || {};
            const to: string | undefined = tx.to;
            const from: string | undefined = tx.from;
            const data: string | undefined = tx.data ? String(tx.data) : undefined;
            const selector = data ? data.slice(0, 10) : undefined;
            const value = tx.value;
            const gas = tx.gas;
          
            console.log("[Aegis/inpage] eth_sendTransaction detected via", label, {
              to, 
              from,
              selector, 
              hasData: !!data,
              value: value ? String(value) : undefined,
              gas: gas ? String(gas) : undefined
            });
            
            // Takip edilen adreslerle ilgili transaction kontrolü
            const fromLower = from?.toLowerCase();
            const toLower = to?.toLowerCase();
            const isTrackedFrom = fromLower && trackedAddresses.includes(fromLower);
            const isTrackedTo = toLower && trackedAddresses.includes(toLower);
            
            if (isTrackedFrom || isTrackedTo) {
              console.log("[Aegis/inpage] TRACKED ADDRESS TRANSACTION DETECTED!", {
                from: fromLower,
                to: toLower,
                isTrackedFrom,
                isTrackedTo,
                trackedAddresses
              });
              
              post("Aegis/ApproveDetected", {
                title: "🚨 TRACKED ADDRESS TRANSACTION",
                body: `${isTrackedFrom ? 'FROM' : 'TO'} tracked address: ${fromLower || toLower}`,
              });
            }
            
            // Basit bildirim gönder (Remix flow'unu bozmasın)
            if (!to && data) {
              post("Aegis/ApproveDetected", {
                title: "🚨 CONTRACT DEPLOYMENT",
                body: `Contract deployment detected from ${from || "Unknown"}`,
              });
            } else if (to && !data) {
              post("Aegis/ApproveDetected", {
                title: "💰 ETH TRANSFER",
                body: `ETH transfer to ${short(to)}`,
              });
            } else if (to && data) {
              // Contract verification kontrolü
              checkContractVerification(to).then((isVerified) => {
                if (!isVerified) {
                  post("Aegis/ApproveDetected", {
                    title: "⚠️ UNVERIFIED CONTRACT",
                    body: `Contract call to UNVERIFIED contract!\nAddress: ${to}\n⚠️ Source code not available - proceed with caution!`,
                  });
                } else {
                  post("Aegis/ApproveDetected", {
                    title: "📋 CONTRACT INTERACTION",
                    body: `Contract call to verified contract\nAddress: ${to}`,
                  });
                }
              });
            }
            
            // Orijinal çağrıyı yap
            return await target.apply(thisArg, argArray);
          }
          function post(type: string, payload: any) {
            const packet = { target: "AegisInpage", type, payload, address: payload?.address };
            console.log("[Aegis/inpage] post:", type, payload);
            // 1) window.postMessage
            window.postMessage(packet, "*");
            // 2) DOM CustomEvent (sandbox yedeği)
            try {
              document.dispatchEvent(new CustomEvent("AegisInpageEvent", { detail: packet }));
            } catch {}
          }
          
          function short(a?: string) {
            return a ? a.slice(0, 6) + "…" + a.slice(-4) : "unknown";
          }

          // 2) Hesap isteği → adresi takip et
          if (args?.method === "eth_requestAccounts") {
            console.log("[Aegis/inpage] eth_requestAccounts via", label);
            const res = await target.apply(thisArg, argArray);
            const addr = Array.isArray(res) ? res[0] : undefined;
            if (addr) post("Aegis/TrackAddress", { address: addr });
            return res;
          }
          
          // 3) Diğer transaction method'ları
          if (args?.method === "eth_sendRawTransaction") {
            console.log("[Aegis/inpage] eth_sendRawTransaction via", label);
            post("Aegis/ApproveDetected", {
              title: "Raw Transaction",
              body: "Raw transaction being sent - review carefully",
            });
            return await target.apply(thisArg, argArray);
          }
          
          if (args?.method === "eth_signTransaction") {
            console.log("[Aegis/inpage] eth_signTransaction via", label);
            post("Aegis/ApproveDetected", {
              title: "Transaction Signing",
              body: "Transaction is being signed - review details",
            });
            return await target.apply(thisArg, argArray);
          }

          // 4) İmza akışları
          if ((args?.method || "").startsWith("eth_signTypedData") || args?.method === "personal_sign") {
            console.log("[Aegis/inpage] signature method:", args.method, "via", label);
            post("Aegis/ApproveDetected", {
              title: "Signature Request",
              body: "Review the message before signing",
            });
            return await target.apply(thisArg, argArray);
          }

          return await target.apply(thisArg, argArray);
        } catch (e) {
          console.error("[Aegis/inpage] error", e);
          throw e;
        }
      },
    });

    try {
      Object.defineProperty(provider, "request", { value: proxy });
      console.log("[Aegis/inpage] provider.request proxied (defineProperty) —", label);
    } catch {
      provider.request = proxy;
      console.log("[Aegis/inpage] provider.request proxied (assign) —", label);
    }

    HOOKED.add(provider);
    LAST_SIG.set(provider, proxy.toString());
  }

  // Tüm bilinen provider yüzeylerini tara ve hook'la
  function scanAndHookAll() {
    const w = window as any;
    
    // 1) window.ethereum
    if (w.ethereum) {
      hookProvider(w.ethereum, "window.ethereum");
      // 2) window.ethereum.providers (EIP-6963 toplaması)
      if (Array.isArray(w.ethereum.providers)) {
        for (const p of w.ethereum.providers) {
          hookProvider(p, "ethereum.providers[]");
        }
      }
    }
    
    // 3) Remix-specific provider'lar
    if (w.remix) {
      console.log("[Aegis/inpage] Remix detected, scanning for providers");
      // Remix'in kendi provider'larını ara
      const remixProviders = [
        w.remix.ethereum,
        w.remix.provider,
        w.remix.web3?.currentProvider,
        w.remix.web3?.eth?.currentProvider
      ].filter(Boolean);
      
      remixProviders.forEach((provider, i) => {
        hookProvider(provider, `remix.provider[${i}]`);
      });
    }
    
    // 4) Remix IDE specific detection
    if (location.hostname.includes('remix.ethereum.org') || location.hostname.includes('remix-project.org')) {
      // console.log("[Aegis/inpage] Remix IDE detected, setting up specific hooks"); // Spam log'u kaldırıldı
      
      // Remix'in kendi transaction handler'larını ara
      const remixElements = [
        'remix-app',
        'remix-ide',
        'remix-ui',
        'tx-runner',
        'tx-execution'
      ];
      
      remixElements.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((element, i) => {
          console.log(`[Aegis/inpage] Found Remix element: ${selector}[${i}]`);
          
          // Click event'lerini dinle
          element.addEventListener('click', (e) => {
            console.log(`[Aegis/inpage] Remix element clicked: ${selector}`, e.target);
            post("Aegis/ApproveDetected", {
              title: "Remix Transaction",
              body: `Transaction triggered via ${selector}`,
            });
          });
        });
      });
    }
    
    // 4) Web3 provider'ları
    if (w.web3?.currentProvider) {
      hookProvider(w.web3.currentProvider, "web3.currentProvider");
    }
    
    // 5) Diğer yaygın provider isimleri
    const commonProviders = [
      'ethereum', 'web3', 'provider', 'wallet', 'metamask'
    ];
    
    commonProviders.forEach(name => {
      if (w[name] && typeof w[name].request === 'function') {
        hookProvider(w[name], `window.${name}`);
      }
    });
  }

  // Dropdown UI'ı hemen oluştur - hızlı yükleme için
  createDropdownUI();
  
  // Başlangıç taraması
  scanAndHookAll();
  
  // Takip edilen adresleri yükle
  getTrackedAddresses();
  
  // Dropdown UI fonksiyonu
  function createDropdownUI() {
    // Mevcut dropdown'ı kaldır
    const existingDropdown = document.getElementById('aegis-dropdown');
    if (existingDropdown) {
      existingDropdown.remove();
    }
    
    // Dropdown container oluştur
    const dropdown = document.createElement('div');
    dropdown.id = 'aegis-dropdown';
    // Basit test dropdown - sadece input ve analiz
    dropdown.innerHTML = `
      <div style="padding: 20px; color: white; font-family: Arial, sans-serif;">
        <div style="font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #4ade80;">
          🛡️ Aegis - Address Tracker
        </div>
        
        <div style="margin-bottom: 10px; color: #e5e7eb;">
          Track Address:
        </div>
        <input type="text" id="aegis-address-input" placeholder="0x..." 
               style="width: 100%; padding: 8px; border: 1px solid #374151; border-radius: 6px; 
                      background: #1f2937; color: white; margin-bottom: 10px; box-sizing: border-box;" />
        <button id="aegis-add-btn" 
                style="width: 100%; padding: 10px; background: #4ade80; color: black; 
                       border: none; border-radius: 6px; font-weight: bold; cursor: pointer; margin-bottom: 15px;">
          Add Address
        </button>
        
        <div style="font-size: 14px; font-weight: bold; margin-bottom: 10px; color: #fbbf24;">
          Tracked Addresses:
        </div>
        <div id="aegis-tracked-addresses" 
             style="background: #111827; padding: 10px; border-radius: 6px; border: 1px solid #374151; 
                    font-size: 12px; color: #d1d5db; line-height: 1.4; margin-bottom: 15px; max-height: 120px; overflow-y: auto;">
          <div style="color: #9ca3af;">No addresses tracked yet</div>
        </div>
        
        <div style="font-size: 14px; font-weight: bold; margin-bottom: 10px; color: #fbbf24;">
          Transaction Analysis:
        </div>
        <div style="background: #111827; padding: 10px; border-radius: 6px; border: 1px solid #374151; 
                    font-size: 12px; color: #d1d5db; line-height: 1.4;">
          <div>• Contract Deployment: Bytecode analysis</div>
          <div>• ETH Transfer: Amount & gas tracking</div>
          <div>• Token Approval: Spender permissions</div>
          <div>• Contract Call: Method signature detection</div>
          <div>• Verification: Etherscan source check</div>
        </div>
      </div>
    `;
    
    // CSS stilleri ekle
    const style = document.createElement('style');
    style.textContent = `
      #aegis-dropdown {
        position: fixed !important;
        top: 60px !important;
        right: 20px !important;
        width: 350px !important;
        min-height: 300px !important;
        background: #1a1a1a !important;
        border: 2px solid #4ade80 !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
        z-index: 2147483647 !important;
        font-family: Arial, sans-serif !important;
        color: white !important;
        display: none !important;
      }
      
      #aegis-dropdown.aegis-visible {
        display: block !important;
      }
      
      .aegis-dropdown-container {
        padding: 0;
      }
      
      .aegis-dropdown-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid #333;
        background: #2a2a2a;
        border-radius: 12px 12px 0 0;
      }
      
      .aegis-logo {
        font-weight: bold;
        font-size: 16px;
      }
      
      .aegis-status {
        font-size: 12px;
        color: #4ade80;
        background: rgba(74, 222, 128, 0.1);
        padding: 4px 8px;
        border-radius: 6px;
      }
      
      .aegis-dropdown-content {
        padding: 20px;
        max-height: 400px;
        overflow-y: auto;
      }
      
      .aegis-section {
        margin-bottom: 20px;
      }
      
      .aegis-section:last-child {
        margin-bottom: 0;
      }
      
      .aegis-section-title {
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 12px;
        color: #e5e5e5;
      }
      
      .aegis-address-list {
        margin-bottom: 12px;
      }
      
      .aegis-address-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: #2a2a2a;
        border-radius: 6px;
        margin-bottom: 6px;
        font-size: 12px;
      }
      
      .aegis-address-text {
        font-family: monospace;
        color: #e5e5e5;
      }
      
      .aegis-remove-btn {
        background: #ef4444;
        color: white;
        border: none;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 10px;
        cursor: pointer;
      }
      
      .aegis-remove-btn:hover {
        background: #dc2626;
      }
      
      .aegis-add-address {
        display: flex;
        gap: 8px;
      }
      
      #aegis-address-input {
        flex: 1;
        padding: 8px 12px;
        background: #2a2a2a;
        border: 1px solid #444;
        border-radius: 6px;
        color: white;
        font-size: 12px;
      }
      
      #aegis-address-input:focus {
        outline: none;
        border-color: #4ade80;
      }
      
      #aegis-add-btn {
        padding: 8px 16px;
        background: #4ade80;
        color: #1a1a1a;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      
      #aegis-add-btn:hover {
        background: #22c55e;
      }
      
      .aegis-alert-item {
        padding: 12px;
        background: #2a2a2a;
        border-radius: 6px;
        margin-bottom: 8px;
        border-left: 3px solid #4ade80;
      }
      
      .aegis-alert-title {
        font-weight: 600;
        font-size: 13px;
        margin-bottom: 4px;
      }
      
      .aegis-alert-body {
        font-size: 11px;
        color: #a3a3a3;
        line-height: 1.4;
      }
      
      .aegis-no-addresses,
      .aegis-no-alerts {
        text-align: center;
        color: #666;
        font-size: 12px;
        padding: 20px;
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(dropdown);
    
    // Başlangıçta gizli yap - hemen
    dropdown.style.display = 'none';
    
    // Event listener'ları ekle
    setupDropdownEvents();
    
    // İlk yükleme
    updateTrackedAddresses();
    
    console.log("[Aegis/inpage] Dropdown created and ready!");
  }
  
  // Tracked addresses'i güncelle
  function updateTrackedAddresses() {
    const container = document.getElementById('aegis-tracked-addresses');
    if (container) {
      if (trackedAddresses.length === 0) {
        container.innerHTML = '<div style="color: #9ca3af;">No addresses tracked yet</div>';
      } else {
        container.innerHTML = trackedAddresses.map(addr => `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; padding: 5px; background: #1f2937; border-radius: 4px;">
            <span style="font-family: monospace; font-size: 11px;">${addr}</span>
            <button onclick="removeAddress('${addr}')" style="background: #dc2626; color: white; border: none; border-radius: 3px; padding: 2px 6px; font-size: 10px; cursor: pointer;">Remove</button>
          </div>
        `).join('');
      }
    }
  }
  
  // Dropdown event'leri
  function setupDropdownEvents() {
    const addBtn = document.getElementById('aegis-add-btn');
    const addressInput = document.getElementById('aegis-address-input');
    
    if (addBtn && addressInput) {
      addBtn.addEventListener('click', () => {
        const address = addressInput.value.trim();
        if (address && address.startsWith('0x') && address.length === 42) {
          // Content script'e mesaj gönder
          window.postMessage({ 
            target: "AegisContent", 
            type: "Aegis/AddAddress", 
            address: address 
          }, "*");
          
          // Local state'i güncelle
          trackedAddresses.push(address.toLowerCase());
          addressInput.value = '';
          updateTrackedAddresses();
        }
      });
      
      addressInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          addBtn.click();
        }
      });
    }
  }
  
  // Dropdown içeriğini güncelle
  function updateDropdownContent() {
    const addressList = document.getElementById('aegis-address-list');
    if (addressList) {
      if (trackedAddresses.length === 0) {
        addressList.innerHTML = '<div class="aegis-no-addresses">No addresses tracked</div>';
      } else {
        addressList.innerHTML = trackedAddresses.map(addr => `
          <div class="aegis-address-item">
            <span class="aegis-address-text">${addr}</span>
            <button class="aegis-remove-btn" onclick="removeAddress('${addr}')">Remove</button>
          </div>
        `).join('');
      }
    }
  }
  
  // Adres kaldırma fonksiyonu
  (window as any).removeAddress = (address: string) => {
    // Content script'e mesaj gönder
    window.postMessage({ 
      target: "AegisContent", 
      type: "Aegis/RemoveAddress", 
      address: address 
    }, "*");
    
    // Local state'i güncelle
    trackedAddresses = trackedAddresses.filter(addr => addr.toLowerCase() !== address.toLowerCase());
    updateTrackedAddresses();
  };
  
  // Dropdown'ı göster/gizle
  function toggleDropdown() {
    const dropdown = document.getElementById('aegis-dropdown');
    if (dropdown) {
      const isVisible = dropdown.classList.contains('aegis-visible');
      if (isVisible) {
        dropdown.classList.remove('aegis-visible');
        console.log("[Aegis/inpage] Dropdown hidden");
      } else {
        dropdown.classList.add('aegis-visible');
        console.log("[Aegis/inpage] Dropdown shown");
      }
      console.log(`[Aegis/inpage] Dropdown computed style:`, {
        display: window.getComputedStyle(dropdown).display,
        visibility: window.getComputedStyle(dropdown).visibility,
        opacity: window.getComputedStyle(dropdown).opacity,
        zIndex: window.getComputedStyle(dropdown).zIndex,
        position: window.getComputedStyle(dropdown).position,
        top: window.getComputedStyle(dropdown).top,
        right: window.getComputedStyle(dropdown).right,
        classes: dropdown.className
      });
    } else {
      console.log("[Aegis/inpage] Dropdown element not found!");
    }
  }
  
  // Global toggle fonksiyonu
  (window as any).toggleAegisDropdown = toggleDropdown;
  
  // Content script'ten gelen toggle mesajını dinle
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (data && data.target === "AegisInpage" && data.type === "Aegis/ToggleDropdown") {
      console.log("[Aegis/inpage] Toggle dropdown message received");
      toggleDropdown();
    }
  });
  
  // Global window object'lerini hook'la
  function setupGlobalHooks() {
    const w = window as any;
    
    // window.ethereum'u global olarak hook'la
    if (w.ethereum) {
      console.log("[Aegis/inpage] Setting up global ethereum hook");
      const originalEthereum = w.ethereum;
      
      w.ethereum = new Proxy(originalEthereum, {
        get(target, prop) {
          if (prop === 'request') {
            return new Proxy(target.request, {
              apply: async (fn, thisArg, args) => {
                console.log("[Aegis/inpage] Global ethereum.request called:", args);
                return await fn.apply(thisArg, args);
              }
            });
          }
          return target[prop];
        }
      });
    }
    
    // window.web3'ü global olarak hook'la
    if (w.web3) {
      console.log("[Aegis/inpage] Setting up global web3 hook");
      const originalWeb3 = w.web3;
      
      w.web3 = new Proxy(originalWeb3, {
        get(target, prop) {
          if (prop === 'eth') {
            const eth = target.eth;
            return new Proxy(eth, {
              get(ethTarget, ethProp) {
                if (ethProp === 'sendTransaction') {
                  return new Proxy(ethTarget.sendTransaction, {
                    apply: async (fn, thisArg, args) => {
                      console.log("[Aegis/inpage] Global web3.eth.sendTransaction called:", args);
                      post("Aegis/ApproveDetected", {
                        title: "Web3 Transaction",
                        body: "Transaction via web3.eth.sendTransaction",
                      });
                      return await fn.apply(thisArg, args);
                    }
                  });
                }
                return ethTarget[ethProp];
              }
            });
          }
          return target[prop];
        }
      });
    }
  }
  
  setupGlobalHooks();
  
  // Network monitoring - fetch ve XMLHttpRequest'i hook'la
  function setupNetworkMonitoring() {
    console.log("[Aegis/inpage] Setting up network monitoring");
    
    // Fetch API'yi hook'la
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const [resource, config] = args;
      const url = typeof resource === 'string' ? resource : (resource as Request).url;
      
      // RPC endpoint'lerini kontrol et
      if (url.includes('eth_') || url.includes('rpc') || url.includes('infura') || url.includes('alchemy')) {
        console.log("[Aegis/inpage] RPC request detected:", url, config?.body);
        
        if (config?.body && typeof config.body === 'string') {
          try {
            const body = JSON.parse(config.body);
            if (body.method === 'eth_sendTransaction' && body.params && body.params[0]) {
              const tx = body.params[0];
              const from = tx.from?.toLowerCase();
              const to = tx.to?.toLowerCase();
              const isTrackedFrom = from && trackedAddresses.includes(from);
              const isTrackedTo = to && trackedAddresses.includes(to);
              
              console.log("[Aegis/inpage] eth_sendTransaction via fetch detected", {
                from, to, isTrackedFrom, isTrackedTo
              });
              
              if (isTrackedFrom || isTrackedTo) {
                post("Aegis/ApproveDetected", {
                  title: "🚨 TRACKED ADDRESS RPC TRANSACTION",
                  body: `${isTrackedFrom ? 'FROM' : 'TO'} tracked address via RPC: ${from || to}`,
                });
              } else if (to) {
                // Contract verification kontrolü
                checkContractVerification(to).then((isVerified) => {
                  if (!isVerified) {
                    post("Aegis/ApproveDetected", {
                      title: "⚠️ UNVERIFIED CONTRACT RPC",
                      body: `RPC call to UNVERIFIED contract!\nAddress: ${to}\n⚠️ Source code not available!`,
                    });
                  } else {
                    post("Aegis/ApproveDetected", {
                      title: "RPC Transaction",
                      body: `RPC call to verified contract\nAddress: ${to}`,
                    });
                  }
                });
              } else {
                post("Aegis/ApproveDetected", {
                  title: "RPC Transaction",
                  body: "Transaction via RPC fetch request",
                });
              }
            }
          } catch (e) {
            // JSON parse hatası, görmezden gel
          }
        }
      }
      
      return await originalFetch(...args);
    };
    
    // XMLHttpRequest'i hook'la
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method: string, url: string | URL, async: boolean = true, username?: string | null, password?: string | null) {
      (this as any)._url = url.toString();
      return originalXHROpen.call(this, method, url, async, username, password);
    };
    
    XMLHttpRequest.prototype.send = function(data?: Document | XMLHttpRequestBodyInit | null) {
      const url = (this as any)._url;
      if (url && (url.includes('eth_') || url.includes('rpc') || url.includes('infura') || url.includes('alchemy'))) {
        console.log("[Aegis/inpage] RPC request via XHR detected:", url, data);
        
        if (data && typeof data === 'string') {
          try {
            const body = JSON.parse(data);
            if (body.method === 'eth_sendTransaction' && body.params && body.params[0]) {
              const tx = body.params[0];
              const from = tx.from?.toLowerCase();
              const to = tx.to?.toLowerCase();
              const isTrackedFrom = from && trackedAddresses.includes(from);
              const isTrackedTo = to && trackedAddresses.includes(to);
              
              console.log("[Aegis/inpage] eth_sendTransaction via XHR detected", {
                from, to, isTrackedFrom, isTrackedTo
              });
              
              if (isTrackedFrom || isTrackedTo) {
                post("Aegis/ApproveDetected", {
                  title: "🚨 TRACKED ADDRESS RPC TRANSACTION",
                  body: `${isTrackedFrom ? 'FROM' : 'TO'} tracked address via XHR: ${from || to}`,
                });
              } else {
                post("Aegis/ApproveDetected", {
                  title: "RPC Transaction",
                  body: "Transaction via RPC XHR request",
                });
              }
            }
          } catch (e) {
            // JSON parse hatası, görmezden gel
          }
        }
      }
      
      return originalXHRSend.call(this, data);
    };
  }
  
  setupNetworkMonitoring();
  
  // Tüm button click'lerini dinle (Remix için) - sadeleştirilmiş
  document.addEventListener('click', (e) => {
    const target = e.target as Element;
    
    if (target.tagName === 'BUTTON') {
      const buttonText = target.textContent?.toLowerCase() || '';
      const buttonClass = target.className?.toLowerCase() || '';
      const buttonId = target.id?.toLowerCase() || '';
      
      // Transaction ile ilgili button'ları yakala
      if (buttonText.includes('transact') || buttonText.includes('send') || 
          buttonText.includes('transfer') || buttonText.includes('run') ||
          buttonText.includes('execute') || buttonText.includes('deploy') ||
          buttonClass.includes('transact') || buttonClass.includes('send') ||
          buttonClass.includes('transfer') || buttonClass.includes('run') ||
          buttonClass.includes('execute') || buttonClass.includes('deploy') ||
          buttonId.includes('transact') || buttonId.includes('send') ||
          buttonId.includes('transfer') || buttonId.includes('run') ||
          buttonId.includes('execute') || buttonId.includes('deploy')) {
        
        console.log("[Aegis/inpage] Transaction button clicked:", {
          text: buttonText,
          class: buttonClass,
          id: buttonId
        });
        
        post("Aegis/ApproveDetected", {
          title: "Transaction Button Clicked",
          body: `Button clicked: ${buttonText || buttonClass || buttonId}`,
        });
      }
    }
  });
  
  // Tüm click event'lerini yakala (debug için) - KAPALI spam yapıyor
  // document.addEventListener('click', (e) => {
  //   console.log("[Aegis/inpage] DEBUG - Any click:", e.target);
  // }, true);
  
  // Test notification kaldırıldı - sürekli spam yapıyordu
  
  // Basit test - her 5 saniyede bir test bildirimi (KAPALI - sonsuz döngü yapıyor)
  // setInterval(() => {
  //   console.log("[Aegis/inpage] PERIODIC TEST - Sending notification");
  //   post("Aegis/ApproveDetected", {
  //     title: "Periodic Test",
  //     body: `Test at ${new Date().toLocaleTimeString()}`,
  //   });
  // }, 5000);
  
  // Debug: Tüm window object'lerini logla
  setTimeout(() => {
    console.log("[Aegis/inpage] DEBUG - Window objects:", {
      ethereum: !!window.ethereum,
      web3: !!window.web3,
      remix: !!(window as any).remix,
      location: location.href,
      userAgent: navigator.userAgent,
      trackedAddresses: trackedAddresses
    });
    
    // Tüm button'ları bul ve logla
    const allButtons = document.querySelectorAll('button');
    console.log("[Aegis/inpage] DEBUG - Found buttons:", allButtons.length);
    allButtons.forEach((btn, i) => {
      if (i < 10) { // İlk 10 button'u logla
        console.log(`[Aegis/inpage] Button ${i}:`, {
          text: btn.textContent,
          class: btn.className,
          id: btn.id,
          onclick: btn.onclick
        });
      }
    });
  }, 3000);

  // Periyodik tarama (geç enjeksyon / yeniden atama durumları için)
  const interval = setInterval(scanAndHookAll, 500);
  
  // Daha agresif tarama - DOM değişikliklerini izle
  const observer = new MutationObserver((mutations) => {
    // DOM değiştiğinde provider'ları tekrar tara
    setTimeout(scanAndHookAll, 100);
    
    // Transaction button'larını ara
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            
            // Transaction button'larını ara - daha geniş arama
            const transactionButtons = element.querySelectorAll?.(
              'button[class*="transact"], button[class*="send"], button[class*="transfer"], ' +
              'button[id*="transact"], button[id*="send"], button[id*="transfer"], ' +
              'button[class*="run"], button[class*="execute"], button[class*="deploy"], ' +
              'button[id*="run"], button[id*="execute"], button[id*="deploy"]'
            ) || [];
            
            transactionButtons.forEach((button) => {
              console.log("[Aegis/inpage] Transaction button found:", button);
              button.addEventListener('click', () => {
                console.log("[Aegis/inpage] Transaction button clicked");
                post("Aegis/ApproveDetected", {
                  title: "Transaction Button Clicked",
                  body: "Transaction button was clicked - review carefully",
                });
              });
            });
          }
        });
      }
    });
  });
  
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true
  });

  // EIP-6963 ile duyurulan yeni sağlayıcıları dinle
  window.addEventListener(
    "eip6963:announceProvider" as any,
    (event: any) => {
      const p = event?.detail?.provider;
      if (p) {
        console.log("[Aegis/inpage] eip6963:announceProvider");
        hookProvider(p, "eip6963");
      }
    },
    { passive: true }
  );
  
  // Remix-specific event'leri dinle
  window.addEventListener("remix:transaction" as any, (event: any) => {
    console.log("[Aegis/inpage] Remix transaction event:", event.detail);
    post("Aegis/ApproveDetected", {
      title: "Remix Transaction",
      body: "Transaction detected in Remix IDE",
    });
  });
  
  // Web3 event'leri dinle
  window.addEventListener("web3:transaction" as any, (event: any) => {
    console.log("[Aegis/inpage] Web3 transaction event:", event.detail);
    post("Aegis/ApproveDetected", {
      title: "Web3 Transaction",
      body: "Transaction detected via Web3",
    });
  });
  
  // Tüm window event'lerini dinle (debug için)
  const originalAddEventListener = window.addEventListener;
  window.addEventListener = function(type: string, listener: any, options?: any) {
    if (type.includes('transaction') || type.includes('send') || type.includes('transfer')) {
      console.log("[Aegis/inpage] DEBUG - Window event listener added:", type);
    }
    return originalAddEventListener.call(this, type, listener, options);
  };
  
  // Tüm message event'lerini dinle - KAPALI (MetaMask'ı bozuyor)
  // window.addEventListener('message', (event) => {
  //   if (event.data && typeof event.data === 'object') {
  //     const data = event.data;
  //     if (data.method === 'eth_sendTransaction' || 
  //         data.type === 'transaction' || 
  //         data.action === 'sendTransaction' ||
  //         JSON.stringify(data).includes('eth_sendTransaction')) {
  //       console.log("[Aegis/inpage] DEBUG - Message event with transaction:", data);
        
  //       // Transaction detaylarını çıkar
  //       let contractAddress = "Unknown";
  //       let transactionType = "Transaction";
        
  //       if (data.params && data.params[0]) {
  //         const tx = data.params[0];
  //         if (tx.to) {
  //           contractAddress = tx.to;
  //           transactionType = "Contract Call";
  //         } else if (tx.data) {
  //           transactionType = "Contract Deployment";
  //         }
  //       }
        
  //       post("Aegis/ApproveDetected", {
  //         title: "Message Transaction",
  //         body: `${transactionType} detected via message event\nContract: ${contractAddress}`,
  //       });
  //     }
  //   }
  // });

  // Sayfa ayrılırken interval'leri temizle
  window.addEventListener("beforeunload", () => {
    clearInterval(interval);
    observer.disconnect();
  });
})();