"use strict";
var InpageBundle = (() => {
  // src/inpage.ts
  (() => {
    if (window.__AEGIS_INPAGE_LOADED) {
      console.log("[Aegis/inpage] Already loaded, skipping");
      return;
    }
    window.__AEGIS_INPAGE_LOADED = true;
    console.log("[Aegis/inpage] init", location.href);
    let trackedAddresses = [];
    let recentTransactions = [];
    window.toggleAegisDropdown = () => {
      const dropdown = document.getElementById("aegis-dropdown");
      if (dropdown) {
        const isVisible = dropdown.classList.contains("aegis-visible");
        if (isVisible) {
          dropdown.classList.remove("aegis-visible");
          dropdown.style.display = "none";
          console.log("[Aegis/inpage] Dropdown hidden");
        } else {
          dropdown.classList.add("aegis-visible");
          dropdown.style.display = "block";
          console.log("[Aegis/inpage] Dropdown shown");
        }
      } else {
        console.log("[Aegis/inpage] Dropdown not found, creating...");
        createDropdownUI();
      }
    };
    function initDropdown() {
      if (document.head && document.body) {
        createDropdownUI();
      } else {
        setTimeout(initDropdown, 50);
      }
    }
    initDropdown();
    const HOOKED = /* @__PURE__ */ new WeakSet();
    const ORIGINALS = /* @__PURE__ */ new WeakMap();
    const LAST_SIG = /* @__PURE__ */ new WeakMap();
    async function getTrackedAddresses() {
      return new Promise((resolve) => {
        try {
          window.postMessage({ target: "AegisContent", type: "Aegis/GetAddresses" }, "*");
          const handleResponse = (event) => {
            if (event.source !== window) return;
            const data = event.data;
            if (data && data.target === "AegisInpage" && data.type === "Aegis/AddressesResponse") {
              trackedAddresses = (data.addresses || []).map((addr) => addr.toLowerCase());
              console.log("[Aegis/inpage] Tracked addresses loaded:", trackedAddresses);
              window.removeEventListener("message", handleResponse);
              updateTrackedAddresses();
              resolve(trackedAddresses);
            }
          };
          window.addEventListener("message", handleResponse);
          setTimeout(() => {
            window.removeEventListener("message", handleResponse);
            resolve([]);
          }, 1e3);
        } catch (e) {
          console.error("[Aegis/inpage] Get addresses error:", e);
          resolve([]);
        }
      });
    }
    async function checkContractVerification(contractAddress) {
      try {
        const response = await fetch(`https://api-sepolia.etherscan.io/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=YourApiKey`);
        const data = await response.json();
        if (data.status === "1" && data.result && data.result[0]) {
          const contractInfo = data.result[0];
          const isVerified = contractInfo.SourceCode && contractInfo.SourceCode !== "";
          console.log(`[Aegis/inpage] Contract ${contractAddress} verification status:`, isVerified);
          return isVerified;
        }
        return false;
      } catch (e) {
        console.error("[Aegis/inpage] Contract verification check error:", e);
        return false;
      }
    }
    function short(a) {
      return a ? a.slice(0, 6) + "\u2026" + a.slice(-4) : "unknown";
    }
    function post(type, payload) {
      const packet = { target: "AegisInpage", type, payload, address: payload?.address };
      console.log("[Aegis/inpage] post:", type, payload);
      try {
        window.postMessage(packet, "*");
      } catch (e) {
        console.error("[Aegis/inpage] postMessage error:", e);
      }
      try {
        document.dispatchEvent(new CustomEvent("AegisInpageEvent", { detail: packet }));
      } catch (e) {
        console.error("[Aegis/inpage] CustomEvent error:", e);
      }
    }
    function hookProvider(provider, label = "unknown") {
      if (!provider || typeof provider.request !== "function") {
        console.log(`[Aegis/inpage] Skipping ${label}: not a valid provider`);
        return;
      }
      const sig = provider.request.toString();
      if (HOOKED.has(provider) && LAST_SIG.get(provider) === sig) {
        return;
      }
      console.log(`[Aegis/inpage] Hooking provider: ${label}`, provider);
      const orig = provider.request.bind(provider);
      ORIGINALS.set(provider, orig);
      const proxy = new Proxy(orig, {
        apply: async (target, thisArg, argArray) => {
          const args = argArray?.[0] || {};
          try {
            let post3 = function(type, payload) {
              const packet = { target: "AegisInpage", type, payload, address: payload?.address };
              console.log("[Aegis/inpage] post:", type, payload);
              window.postMessage(packet, "*");
              try {
                document.dispatchEvent(new CustomEvent("AegisInpageEvent", { detail: packet }));
              } catch {
              }
            }, short3 = function(a) {
              return a ? a.slice(0, 6) + "\u2026" + a.slice(-4) : "unknown";
            };
            var post2 = post3, short2 = short3;
            if (args?.method === "eth_sendTransaction" && Array.isArray(args.params) && args.params[0]) {
              const tx = args.params[0] || {};
              const to = tx.to;
              const from = tx.from;
              const data = tx.data ? String(tx.data) : void 0;
              const selector = data ? data.slice(0, 10) : void 0;
              const value = tx.value;
              const gas = tx.gas;
              console.log("[Aegis/inpage] eth_sendTransaction detected via", label, {
                to,
                from,
                selector,
                hasData: !!data,
                value: value ? String(value) : void 0,
                gas: gas ? String(gas) : void 0
              });
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
                setTimeout(() => {
                  const dropdown = document.getElementById("aegis-dropdown");
                  if (dropdown) {
                    dropdown.classList.add("aegis-visible");
                    dropdown.style.display = "block";
                    dropdown.style.border = "3px solid #ef4444";
                    dropdown.style.animation = "pulse 1s ease-in-out 3";
                    dropdown.style.zIndex = "999999999";
                    const alertSection = document.getElementById("aegis-alert-section");
                    const alertDetails = document.getElementById("aegis-alert-details");
                    if (alertSection && alertDetails) {
                      alertSection.style.display = "block";
                      let alertTxType = "Contract Call";
                      if (data) {
                        const methodSig = data.substring(0, 10);
                        if (methodSig === "0xa9059cbb") alertTxType = "Token Transfer";
                        else if (methodSig === "0x095ea7b3") alertTxType = "Token Approval";
                        else if (methodSig === "0xa22cb465") alertTxType = "Set Approval For All";
                        else if (methodSig === "0x40c10f19") alertTxType = "Mint";
                        else if (methodSig === "0x42842e0e") alertTxType = "Safe Transfer From";
                        else if (methodSig === "0x23b872dd") alertTxType = "Transfer From";
                      } else if (!to) {
                        alertTxType = "Contract Deployment";
                      } else if (!data) {
                        alertTxType = "ETH Transfer";
                      }
                      let methodDetails = "";
                      if (data) {
                        const methodSig = data.substring(0, 10);
                        if (methodSig === "0xa9059cbb") {
                          methodDetails = "transfer(address,uint256)";
                        } else if (methodSig === "0x095ea7b3") {
                          methodDetails = "approve(address,uint256)";
                        } else if (methodSig === "0xa22cb465") {
                          methodDetails = "setApprovalForAll(address,bool)";
                        } else if (methodSig === "0x40c10f19") {
                          methodDetails = "mint(address,uint256)";
                        } else if (methodSig === "0x42842e0e") {
                          methodDetails = "safeTransferFrom(address,address,uint256)";
                        } else if (methodSig === "0x23b872dd") {
                          methodDetails = "transferFrom(address,address,uint256)";
                        } else {
                          methodDetails = `Unknown method (${methodSig})`;
                        }
                      }
                      alertDetails.innerHTML = `
                      <div style="margin-bottom: 8px;"><strong>\u{1F50D} Direction:</strong> ${isTrackedFrom ? "FROM" : "TO"} tracked address</div>
                      <div style="margin-bottom: 8px;"><strong>\u{1F464} Tracked Address:</strong> ${fromLower || toLower}</div>
                      <div style="margin-bottom: 8px;"><strong>\u{1F4C4} Contract Address:</strong> ${to || "N/A"}</div>
                      <div style="margin-bottom: 8px;"><strong>\u26A1 Transaction Type:</strong> ${alertTxType}</div>
                      ${methodDetails ? `<div style="margin-bottom: 8px;"><strong>\u{1F527} Method:</strong> ${methodDetails}</div>` : ""}
                      <div style="margin-bottom: 8px;"><strong>\u23F0 Time:</strong> ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}</div>
                      <div style="margin-top: 10px; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 6px; font-size: 12px;">
                        <strong>\u26A0\uFE0F Warning:</strong> This transaction involves a tracked address. Please review carefully before proceeding.
                      </div>
                    `;
                    }
                    setTimeout(() => {
                      dropdown.style.border = "2px solid #4ade80";
                      dropdown.style.animation = "";
                    }, 3e3);
                    console.log("[Aegis/inpage] Auto-opened dropdown for tracked address transaction");
                  }
                }, 100);
                post3("Aegis/ApproveDetected", {
                  title: "\u{1F6A8} TRACKED ADDRESS TRANSACTION",
                  body: `${isTrackedFrom ? "FROM" : "TO"} tracked address: ${fromLower || toLower}`
                });
              }
              const txHash = `${from}-${to}-${data}-${Date.now()}`;
              if (!to && data) {
                const tx2 = {
                  id: txHash,
                  type: "Contract Deployment",
                  address: from || "Unknown",
                  timestamp: Date.now(),
                  details: {
                    bytecodeLength: data.length,
                    gas: args?.params?.[0]?.gas
                  }
                };
                addRecentTransaction(tx2);
              } else if (to && !data) {
                const tx2 = {
                  id: txHash,
                  type: "ETH Transfer",
                  address: to,
                  timestamp: Date.now(),
                  details: {
                    value: args?.params?.[0]?.value
                  }
                };
                addRecentTransaction(tx2);
              } else if (to && data) {
                const methodSig = data.substring(0, 10);
                let txType = "Contract Call";
                console.log("[Aegis/inpage] Contract call detected:", {
                  to,
                  data,
                  methodSig,
                  from
                });
                if (methodSig === "0xa9059cbb") {
                  txType = "Token Transfer";
                  console.log("[Aegis/inpage] Token Transfer detected");
                } else if (methodSig === "0x095ea7b3") {
                  txType = "Token Approval";
                  console.log("[Aegis/inpage] Token Approval detected");
                } else if (methodSig === "0xa22cb465") {
                  txType = "Set Approval For All";
                  console.log("[Aegis/inpage] Set Approval For All detected");
                } else if (methodSig === "0x40c10f19") {
                  txType = "Mint";
                  console.log("[Aegis/inpage] Mint detected");
                } else if (methodSig === "0x42842e0e") {
                  txType = "Safe Transfer From";
                  console.log("[Aegis/inpage] Safe Transfer From detected");
                } else if (methodSig === "0x23b872dd") {
                  txType = "Transfer From";
                  console.log("[Aegis/inpage] Transfer From detected");
                } else {
                  console.log("[Aegis/inpage] Unknown method signature:", methodSig);
                }
                checkContractVerification(to).then((isVerified) => {
                  const tx2 = {
                    id: txHash,
                    type: txType,
                    address: to,
                    // Contract adresi (doğru)
                    timestamp: Date.now(),
                    details: {
                      method: methodSig,
                      verified: isVerified,
                      from
                      // Wallet adresi de ekle
                    }
                  };
                  addRecentTransaction(tx2);
                });
              }
              return await target.apply(thisArg, argArray);
            }
            if (args?.method === "eth_requestAccounts") {
              console.log("[Aegis/inpage] eth_requestAccounts via", label);
              const res = await target.apply(thisArg, argArray);
              const addr = Array.isArray(res) ? res[0] : void 0;
              if (addr) post3("Aegis/TrackAddress", { address: addr });
              return res;
            }
            if (args?.method === "eth_sendRawTransaction") {
              console.log("[Aegis/inpage] eth_sendRawTransaction via", label);
              post3("Aegis/ApproveDetected", {
                title: "Raw Transaction",
                body: "Raw transaction being sent - review carefully"
              });
              return await target.apply(thisArg, argArray);
            }
            if (args?.method === "eth_signTransaction") {
              console.log("[Aegis/inpage] eth_signTransaction via", label);
              post3("Aegis/ApproveDetected", {
                title: "Transaction Signing",
                body: "Transaction is being signed - review details"
              });
              return await target.apply(thisArg, argArray);
            }
            if ((args?.method || "").startsWith("eth_signTypedData") || args?.method === "personal_sign") {
              console.log("[Aegis/inpage] signature method:", args.method, "via", label);
              post3("Aegis/ApproveDetected", {
                title: "Signature Request",
                body: "Review the message before signing"
              });
              return await target.apply(thisArg, argArray);
            }
            return await target.apply(thisArg, argArray);
          } catch (e) {
            console.error("[Aegis/inpage] error", e);
            throw e;
          }
        }
      });
      try {
        Object.defineProperty(provider, "request", { value: proxy });
        console.log("[Aegis/inpage] provider.request proxied (defineProperty) \u2014", label);
      } catch {
        provider.request = proxy;
        console.log("[Aegis/inpage] provider.request proxied (assign) \u2014", label);
      }
      HOOKED.add(provider);
      LAST_SIG.set(provider, proxy.toString());
    }
    function scanAndHookAll() {
      const w = window;
      if (w.ethereum) {
        hookProvider(w.ethereum, "window.ethereum");
        if (Array.isArray(w.ethereum.providers)) {
          for (const p of w.ethereum.providers) {
            hookProvider(p, "ethereum.providers[]");
          }
        }
      }
      if (w.remix) {
        console.log("[Aegis/inpage] Remix detected, scanning for providers");
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
      if (location.hostname.includes("remix.ethereum.org") || location.hostname.includes("remix-project.org")) {
        const remixElements = [
          "remix-app",
          "remix-ide",
          "remix-ui",
          "tx-runner",
          "tx-execution"
        ];
        remixElements.forEach((selector) => {
          const elements = document.querySelectorAll(selector);
          elements.forEach((element, i) => {
            console.log(`[Aegis/inpage] Found Remix element: ${selector}[${i}]`);
            element.addEventListener("click", (e) => {
              console.log(`[Aegis/inpage] Remix element clicked: ${selector}`, e.target);
              post("Aegis/ApproveDetected", {
                title: "Remix Transaction",
                body: `Transaction triggered via ${selector}`
              });
            });
          });
        });
      }
      if (w.web3?.currentProvider) {
        hookProvider(w.web3.currentProvider, "web3.currentProvider");
      }
      const commonProviders = [
        "ethereum",
        "web3",
        "provider",
        "wallet",
        "metamask"
      ];
      commonProviders.forEach((name) => {
        if (w[name] && typeof w[name].request === "function") {
          hookProvider(w[name], `window.${name}`);
        }
      });
    }
    scanAndHookAll();
    getTrackedAddresses();
    function createDropdownUI() {
      const existingDropdown = document.getElementById("aegis-dropdown");
      if (existingDropdown) {
        existingDropdown.remove();
      }
      const dropdown = document.createElement("div");
      dropdown.id = "aegis-dropdown";
      dropdown.innerHTML = `
      <div style="padding: 20px; color: white; font-family: Arial, sans-serif;">
        <div style="font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #4ade80;">
          \u{1F6E1}\uFE0F Aegis - Address Tracker
        </div>
        
        <div id="aegis-alert-section" style="display: none; background: linear-gradient(135deg, #dc2626, #b91c1c); color: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 3px solid #ef4444; position: relative; box-shadow: 0 4px 20px rgba(220, 38, 38, 0.3);">
          <div style="font-weight: bold; font-size: 18px; margin-bottom: 15px; text-align: center; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">\u{1F6A8} TRACKED ADDRESS ALERT</div>
          <div id="aegis-alert-details" style="font-size: 14px; line-height: 1.6; background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);"></div>
          <button id="aegis-alert-close" style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.3); color: white; font-size: 18px; cursor: pointer; padding: 5px 10px; border-radius: 6px; width: auto; height: auto;">\xD7</button>
        </div>
        
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
          <button id="aegis-manage-addresses" 
                  style="flex: 1; padding: 10px; background: #3b82f6; color: white; 
                         border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
            \u{1F4CB} Manage Addresses
          </button>
          <button id="aegis-recent-transactions-btn" 
                  style="flex: 1; padding: 10px; background: #10b981; color: white; 
                         border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
            \u{1F4CA} Recent Transactions
          </button>
        </div>
        
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
          <button id="aegis-settings" 
                  style="flex: 1; padding: 10px; background: #6b7280; color: white; 
                         border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
            \u2699\uFE0F Settings
          </button>
          <button id="aegis-close-dropdown" 
                  style="flex: 1; padding: 10px; background: #ef4444; color: white; 
                         border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
            \u274C Close
          </button>
        </div>
      </div>
    `;
      const style = document.createElement("style");
      style.textContent = `
      #aegis-dropdown {
        position: fixed !important;
        top: 60px !important;
        left: 20px !important;
        width: 450px !important;
        min-height: 300px !important;
        background: #1a1a1a !important;
        border: 2px solid #4ade80 !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
        z-index: 2147483647 !important;
        z-index: 999999999 !important;
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
      
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.02); }
        100% { transform: scale(1); }
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
      if (document.head) {
        document.head.appendChild(style);
      } else {
        console.warn("[Aegis/inpage] document.head not available");
      }
      if (document.body) {
        document.body.appendChild(dropdown);
      } else {
        console.warn("[Aegis/inpage] document.body not available");
      }
      dropdown.style.display = "none";
      setupDropdownEvents();
      getTrackedAddresses();
      updateRecentTransactions();
      console.log("[Aegis/inpage] Dropdown created and ready!");
    }
    function updateTrackedAddresses() {
      const container = document.getElementById("aegis-tracked-addresses");
      if (container) {
        if (trackedAddresses.length === 0) {
          container.innerHTML = '<div style="color: #9ca3af;">No addresses tracked yet</div>';
        } else {
          container.innerHTML = trackedAddresses.map((addr) => `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; padding: 5px; background: #1f2937; border-radius: 4px;">
            <span style="font-family: monospace; font-size: 11px;">${addr}</span>
            <button onclick="removeAddress('${addr}')" style="background: #dc2626; color: white; border: none; border-radius: 3px; padding: 2px 6px; font-size: 10px; cursor: pointer;">Remove</button>
          </div>
        `).join("");
        }
      }
    }
    function setupDropdownEvents() {
      const alertCloseBtn = document.getElementById("aegis-alert-close");
      if (alertCloseBtn) {
        alertCloseBtn.addEventListener("click", () => {
          const alertSection = document.getElementById("aegis-alert-section");
          if (alertSection) {
            alertSection.style.display = "none";
          }
        });
      }
      const manageBtn = document.getElementById("aegis-manage-addresses");
      if (manageBtn) {
        manageBtn.addEventListener("click", () => {
          showAddressManagement();
        });
      }
      const recentBtn = document.getElementById("aegis-recent-transactions-btn");
      if (recentBtn) {
        recentBtn.addEventListener("click", () => {
          showRecentTransactions();
        });
      }
      const closeBtn = document.getElementById("aegis-close-dropdown");
      if (closeBtn) {
        closeBtn.addEventListener("click", () => {
          const dropdown = document.getElementById("aegis-dropdown");
          if (dropdown) {
            dropdown.classList.remove("aegis-visible");
            dropdown.style.display = "none";
          }
        });
      }
      const settingsBtn = document.getElementById("aegis-settings");
      if (settingsBtn) {
        settingsBtn.addEventListener("click", () => {
          showSettings();
        });
      }
    }
    function showAddressManagement() {
      const existing = document.getElementById("aegis-address-management");
      if (existing) {
        existing.remove();
      }
      const managementPage = document.createElement("div");
      managementPage.id = "aegis-address-management";
      managementPage.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: rgba(0,0,0,0.8) !important;
      z-index: 999999999 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    `;
      managementPage.innerHTML = `
      <div style="background: #1a1a1a; border: 2px solid #4ade80; border-radius: 12px; padding: 20px; width: 500px; max-height: 80vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="color: #4ade80; margin: 0;">\u{1F4CB} Manage Tracked Addresses</h2>
          <button id="aegis-close-management" style="background: #ef4444; color: white; border: none; border-radius: 6px; padding: 8px 12px; cursor: pointer;">Close</button>
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="color: #e5e7eb; display: block; margin-bottom: 5px;">Add New Address:</label>
          <div style="display: flex; gap: 10px;">
            <input type="text" id="aegis-new-address" placeholder="0x..." 
                   style="flex: 1; padding: 10px; border: 1px solid #374151; border-radius: 6px; 
                          background: #1f2937; color: white;" />
            <button id="aegis-add-new" 
                    style="padding: 10px 20px; background: #4ade80; color: black; 
                           border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
              Add
            </button>
          </div>
        </div>
        
        <div style="color: #fbbf24; font-weight: bold; margin-bottom: 10px;">Tracked Addresses (${trackedAddresses.length}):</div>
        <div id="aegis-management-list" 
             style="background: #111827; padding: 15px; border-radius: 6px; border: 1px solid #374151; 
                    max-height: 300px; overflow-y: auto;">
          ${trackedAddresses.length === 0 ? '<div style="color: #9ca3af; text-align: center; padding: 20px;">No addresses tracked yet</div>' : trackedAddresses.map((addr) => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #1f2937; border-radius: 6px; margin-bottom: 8px;">
                <span style="font-family: monospace; color: #e5e5e5; font-size: 12px;">${addr}</span>
                <button onclick="removeAddress('${addr}')" style="background: #ef4444; color: white; border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 12px;">Remove</button>
              </div>
            `).join("")}
        </div>
      </div>
    `;
      document.body.appendChild(managementPage);
      const closeBtn = document.getElementById("aegis-close-management");
      const addBtn = document.getElementById("aegis-add-new");
      const addressInput = document.getElementById("aegis-new-address");
      if (closeBtn) {
        closeBtn.addEventListener("click", () => {
          managementPage.remove();
        });
      }
      if (addBtn && addressInput) {
        addBtn.addEventListener("click", () => {
          const address = addressInput.value.trim();
          if (address && address.startsWith("0x") && address.length === 42) {
            window.postMessage({
              target: "AegisContent",
              type: "Aegis/AddAddress",
              address
            }, "*");
            trackedAddresses.push(address.toLowerCase());
            addressInput.value = "";
            updateManagementList();
          }
        });
        addressInput.addEventListener("keypress", (e) => {
          if (e.key === "Enter") {
            addBtn.click();
          }
        });
      }
      function updateManagementList() {
        const list = document.getElementById("aegis-management-list");
        if (list) {
          list.innerHTML = trackedAddresses.length === 0 ? '<div style="color: #9ca3af; text-align: center; padding: 20px;">No addresses tracked yet</div>' : trackedAddresses.map((addr) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #1f2937; border-radius: 6px; margin-bottom: 8px;">
              <span style="font-family: monospace; color: #e5e5e5; font-size: 12px;">${addr}</span>
              <button onclick="removeAddress('${addr}')" style="background: #ef4444; color: white; border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 12px;">Remove</button>
            </div>
          `).join("");
        }
      }
    }
    function showRecentTransactions() {
      const existing = document.getElementById("aegis-recent-transactions-page");
      if (existing) {
        existing.remove();
      }
      const transactionsPage = document.createElement("div");
      transactionsPage.id = "aegis-recent-transactions-page";
      transactionsPage.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: rgba(0,0,0,0.8) !important;
      z-index: 999999999 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    `;
      transactionsPage.innerHTML = `
      <div style="background: #1a1a1a; border: 2px solid #4ade80; border-radius: 12px; padding: 20px; width: 800px; max-height: 80vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="color: #4ade80; margin: 0;">\u{1F4CA} Recent Transactions (${recentTransactions.length})</h2>
          <button id="aegis-close-transactions" style="background: #ef4444; color: white; border: none; border-radius: 6px; padding: 8px 12px; cursor: pointer;">Close</button>
        </div>
        
        <div id="aegis-transactions-list" 
             style="background: #111827; padding: 15px; border-radius: 6px; border: 1px solid #374151; 
                    max-height: 500px; overflow-y: auto;">
          ${recentTransactions.length === 0 ? '<div style="color: #9ca3af; text-align: center; padding: 40px;">No recent transactions</div>' : recentTransactions.map((tx) => {
        const timeAgo = Math.floor((Date.now() - tx.timestamp) / 1e3);
        const timeStr = timeAgo < 60 ? `${timeAgo}s ago` : `${Math.floor(timeAgo / 60)}m ago`;
        let details = "";
        if (tx.type === "Contract Deployment") {
          details = `Bytecode: ${tx.details.bytecodeLength} bytes`;
        } else if (tx.type === "ETH Transfer") {
          const value = parseInt(tx.details.value || "0", 16) / 1e18;
          details = `Value: ${value.toFixed(4)} ETH`;
        } else if (tx.type === "Mint") {
          details = `Mint to: ${short(tx.details.from)} | Verified: ${tx.details.verified ? "\u2705" : "\u274C"}`;
        } else if (tx.type === "Token Transfer") {
          details = `Transfer | Verified: ${tx.details.verified ? "\u2705" : "\u274C"}`;
        } else if (tx.type === "Token Approval") {
          details = `Approval | Verified: ${tx.details.verified ? "\u2705" : "\u274C"}`;
        } else if (tx.type === "Set Approval For All") {
          details = `Set Approval | Verified: ${tx.details.verified ? "\u2705" : "\u274C"}`;
        } else {
          details = `Method: ${tx.details.method} | Verified: ${tx.details.verified ? "\u2705" : "\u274C"}`;
        }
        return `
                <div style="margin-bottom: 15px; padding: 15px; background: #1f2937; border-radius: 8px; border-left: 4px solid #4ade80;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-weight: bold; color: #4ade80; font-size: 14px;">${tx.type}</div>
                    <div style="color: #6b7280; font-size: 12px;">${timeStr}</div>
                  </div>
                  <div style="color: #d1d5db; font-size: 12px; margin-bottom: 5px; font-family: monospace;">${tx.address}</div>
                  <div style="color: #9ca3af; font-size: 11px;">${details}</div>
                </div>
              `;
      }).join("")}
        </div>
      </div>
    `;
      document.body.appendChild(transactionsPage);
      const closeBtn = document.getElementById("aegis-close-transactions");
      if (closeBtn) {
        closeBtn.addEventListener("click", () => {
          transactionsPage.remove();
        });
      }
    }
    function showSettings() {
      alert("Settings page coming soon!");
    }
    function updateDropdownContent() {
      const addressList = document.getElementById("aegis-address-list");
      if (addressList) {
        if (trackedAddresses.length === 0) {
          addressList.innerHTML = '<div class="aegis-no-addresses">No addresses tracked</div>';
        } else {
          addressList.innerHTML = trackedAddresses.map((addr) => `
          <div class="aegis-address-item">
            <span class="aegis-address-text">${addr}</span>
            <button class="aegis-remove-btn" onclick="removeAddress('${addr}')">Remove</button>
          </div>
        `).join("");
        }
      }
    }
    window.removeAddress = (address) => {
      window.postMessage({
        target: "AegisContent",
        type: "Aegis/RemoveAddress",
        address
      }, "*");
      trackedAddresses = trackedAddresses.filter((addr) => addr.toLowerCase() !== address.toLowerCase());
      updateTrackedAddresses();
    };
    function addRecentTransaction(tx) {
      const isDuplicate = recentTransactions.some((existing) => existing.id === tx.id);
      if (!isDuplicate) {
        recentTransactions.unshift(tx);
        if (recentTransactions.length > 10) {
          recentTransactions = recentTransactions.slice(0, 10);
        }
        updateRecentTransactions();
      } else {
        console.log("[Aegis/inpage] Duplicate transaction prevented:", tx.id);
      }
    }
    function updateRecentTransactions() {
      const container = document.getElementById("aegis-recent-transactions");
      if (container) {
        if (recentTransactions.length === 0) {
          container.innerHTML = '<div style="color: #9ca3af;">No recent transactions</div>';
        } else {
          container.innerHTML = recentTransactions.map((tx) => {
            const timeAgo = Math.floor((Date.now() - tx.timestamp) / 1e3);
            const timeStr = timeAgo < 60 ? `${timeAgo}s ago` : `${Math.floor(timeAgo / 60)}m ago`;
            let details = "";
            if (tx.type === "Contract Deployment") {
              details = `Bytecode: ${tx.details.bytecodeLength} bytes`;
            } else if (tx.type === "ETH Transfer") {
              const value = parseInt(tx.details.value || "0", 16) / 1e18;
              details = `Value: ${value.toFixed(4)} ETH`;
            } else if (tx.type === "Mint") {
              details = `Mint to: ${short(tx.details.from)} | Verified: ${tx.details.verified ? "\u2705" : "\u274C"}`;
            } else if (tx.type === "Token Transfer") {
              details = `Transfer | Verified: ${tx.details.verified ? "\u2705" : "\u274C"}`;
            } else if (tx.type === "Token Approval") {
              details = `Approval | Verified: ${tx.details.verified ? "\u2705" : "\u274C"}`;
            } else if (tx.type === "Set Approval For All") {
              details = `Set Approval | Verified: ${tx.details.verified ? "\u2705" : "\u274C"}`;
            } else {
              details = `Method: ${tx.details.method} | Verified: ${tx.details.verified ? "\u2705" : "\u274C"}`;
            }
            return `
            <div style="margin-bottom: 8px; padding: 6px; background: #1f2937; border-radius: 4px; border-left: 3px solid #4ade80;">
              <div style="font-weight: bold; color: #4ade80; font-size: 11px;">${tx.type}</div>
              <div style="color: #d1d5db; font-size: 10px; margin: 2px 0;">${short(tx.address)}</div>
              <div style="color: #9ca3af; font-size: 9px;">${details}</div>
              <div style="color: #6b7280; font-size: 9px; text-align: right;">${timeStr}</div>
            </div>
          `;
          }).join("");
        }
      }
    }
    function toggleDropdown() {
      const dropdown = document.getElementById("aegis-dropdown");
      if (dropdown) {
        const isVisible = dropdown.classList.contains("aegis-visible");
        if (isVisible) {
          dropdown.classList.remove("aegis-visible");
          console.log("[Aegis/inpage] Dropdown hidden");
        } else {
          dropdown.classList.add("aegis-visible");
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
    window.toggleAegisDropdown = toggleDropdown;
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (data && data.target === "AegisInpage" && data.type === "Aegis/ToggleDropdown") {
        console.log("[Aegis/inpage] Toggle dropdown message received");
        toggleDropdown();
      }
    });
    function setupGlobalHooks() {
      const w = window;
      if (w.ethereum) {
        console.log("[Aegis/inpage] Setting up global ethereum hook");
        const originalEthereum = w.ethereum;
        w.ethereum = new Proxy(originalEthereum, {
          get(target, prop) {
            if (prop === "request") {
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
      if (w.web3) {
        console.log("[Aegis/inpage] Setting up global web3 hook");
        const originalWeb3 = w.web3;
        w.web3 = new Proxy(originalWeb3, {
          get(target, prop) {
            if (prop === "eth") {
              const eth = target.eth;
              return new Proxy(eth, {
                get(ethTarget, ethProp) {
                  if (ethProp === "sendTransaction") {
                    return new Proxy(ethTarget.sendTransaction, {
                      apply: async (fn, thisArg, args) => {
                        console.log("[Aegis/inpage] Global web3.eth.sendTransaction called:", args);
                        post("Aegis/ApproveDetected", {
                          title: "Web3 Transaction",
                          body: "Transaction via web3.eth.sendTransaction"
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
    function setupNetworkMonitoring() {
      console.log("[Aegis/inpage] Setting up network monitoring");
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        const [resource, config] = args;
        const url = typeof resource === "string" ? resource : resource.url;
        if (url.includes("eth_") || url.includes("rpc") || url.includes("infura") || url.includes("alchemy")) {
          console.log("[Aegis/inpage] RPC request detected:", url, config?.body);
          if (config?.body && typeof config.body === "string") {
            try {
              const body = JSON.parse(config.body);
              if (body.method === "eth_sendTransaction" && body.params && body.params[0]) {
                const tx = body.params[0];
                const from = tx.from?.toLowerCase();
                const to = tx.to?.toLowerCase();
                const isTrackedFrom = from && trackedAddresses.includes(from);
                const isTrackedTo = to && trackedAddresses.includes(to);
                console.log("[Aegis/inpage] eth_sendTransaction via fetch detected", {
                  from,
                  to,
                  isTrackedFrom,
                  isTrackedTo
                });
                if (isTrackedFrom || isTrackedTo) {
                  post("Aegis/ApproveDetected", {
                    title: "\u{1F6A8} TRACKED ADDRESS RPC TRANSACTION",
                    body: `${isTrackedFrom ? "FROM" : "TO"} tracked address via RPC: ${from || to}`
                  });
                } else if (to) {
                  checkContractVerification(to).then((isVerified) => {
                    if (!isVerified) {
                      post("Aegis/ApproveDetected", {
                        title: "\u26A0\uFE0F UNVERIFIED CONTRACT RPC",
                        body: `RPC call to UNVERIFIED contract!
Address: ${to}
\u26A0\uFE0F Source code not available!`
                      });
                    } else {
                      post("Aegis/ApproveDetected", {
                        title: "RPC Transaction",
                        body: `RPC call to verified contract
Address: ${to}`
                      });
                    }
                  });
                } else {
                  post("Aegis/ApproveDetected", {
                    title: "RPC Transaction",
                    body: "Transaction via RPC fetch request"
                  });
                }
              }
            } catch (e) {
            }
          }
        }
        return await originalFetch(...args);
      };
      const originalXHROpen = XMLHttpRequest.prototype.open;
      const originalXHRSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url, async = true, username, password) {
        this._url = url.toString();
        return originalXHROpen.call(this, method, url, async, username, password);
      };
      XMLHttpRequest.prototype.send = function(data) {
        const url = this._url;
        if (url && (url.includes("eth_") || url.includes("rpc") || url.includes("infura") || url.includes("alchemy"))) {
          console.log("[Aegis/inpage] RPC request via XHR detected:", url, data);
          if (data && typeof data === "string") {
            try {
              const body = JSON.parse(data);
              if (body.method === "eth_sendTransaction" && body.params && body.params[0]) {
                const tx = body.params[0];
                const from = tx.from?.toLowerCase();
                const to = tx.to?.toLowerCase();
                const isTrackedFrom = from && trackedAddresses.includes(from);
                const isTrackedTo = to && trackedAddresses.includes(to);
                console.log("[Aegis/inpage] eth_sendTransaction via XHR detected", {
                  from,
                  to,
                  isTrackedFrom,
                  isTrackedTo
                });
                if (isTrackedFrom || isTrackedTo) {
                  post("Aegis/ApproveDetected", {
                    title: "\u{1F6A8} TRACKED ADDRESS RPC TRANSACTION",
                    body: `${isTrackedFrom ? "FROM" : "TO"} tracked address via XHR: ${from || to}`
                  });
                } else {
                  post("Aegis/ApproveDetected", {
                    title: "RPC Transaction",
                    body: "Transaction via RPC XHR request"
                  });
                }
              }
            } catch (e) {
            }
          }
        }
        return originalXHRSend.call(this, data);
      };
    }
    setupNetworkMonitoring();
    document.addEventListener("click", (e) => {
      const target = e.target;
      if (target.tagName === "BUTTON") {
        const buttonText = target.textContent?.toLowerCase() || "";
        const buttonClass = target.className?.toLowerCase() || "";
        const buttonId = target.id?.toLowerCase() || "";
        if (buttonText.includes("transact") || buttonText.includes("send") || buttonText.includes("transfer") || buttonText.includes("run") || buttonText.includes("execute") || buttonText.includes("deploy") || buttonClass.includes("transact") || buttonClass.includes("send") || buttonClass.includes("transfer") || buttonClass.includes("run") || buttonClass.includes("execute") || buttonClass.includes("deploy") || buttonId.includes("transact") || buttonId.includes("send") || buttonId.includes("transfer") || buttonId.includes("run") || buttonId.includes("execute") || buttonId.includes("deploy")) {
          console.log("[Aegis/inpage] Transaction button clicked:", {
            text: buttonText,
            class: buttonClass,
            id: buttonId
          });
          post("Aegis/ApproveDetected", {
            title: "Transaction Button Clicked",
            body: `Button clicked: ${buttonText || buttonClass || buttonId}`
          });
        }
      }
    });
    setTimeout(() => {
      console.log("[Aegis/inpage] DEBUG - Window objects:", {
        ethereum: !!window.ethereum,
        web3: !!window.web3,
        remix: !!window.remix,
        location: location.href,
        userAgent: navigator.userAgent,
        trackedAddresses
      });
      const allButtons = document.querySelectorAll("button");
      console.log("[Aegis/inpage] DEBUG - Found buttons:", allButtons.length);
      allButtons.forEach((btn, i) => {
        if (i < 10) {
          console.log(`[Aegis/inpage] Button ${i}:`, {
            text: btn.textContent,
            class: btn.className,
            id: btn.id,
            onclick: btn.onclick
          });
        }
      });
    }, 3e3);
    const interval = setInterval(scanAndHookAll, 500);
    const observer = new MutationObserver((mutations) => {
      setTimeout(scanAndHookAll, 100);
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node;
              const transactionButtons = element.querySelectorAll?.(
                'button[class*="transact"], button[class*="send"], button[class*="transfer"], button[id*="transact"], button[id*="send"], button[id*="transfer"], button[class*="run"], button[class*="execute"], button[class*="deploy"], button[id*="run"], button[id*="execute"], button[id*="deploy"]'
              ) || [];
              transactionButtons.forEach((button) => {
                console.log("[Aegis/inpage] Transaction button found:", button);
                button.addEventListener("click", () => {
                  console.log("[Aegis/inpage] Transaction button clicked");
                  post("Aegis/ApproveDetected", {
                    title: "Transaction Button Clicked",
                    body: "Transaction button was clicked - review carefully"
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
    window.addEventListener(
      "eip6963:announceProvider",
      (event) => {
        const p = event?.detail?.provider;
        if (p) {
          console.log("[Aegis/inpage] eip6963:announceProvider");
          hookProvider(p, "eip6963");
        }
      },
      { passive: true }
    );
    window.addEventListener("remix:transaction", (event) => {
      console.log("[Aegis/inpage] Remix transaction event:", event.detail);
      post("Aegis/ApproveDetected", {
        title: "Remix Transaction",
        body: "Transaction detected in Remix IDE"
      });
    });
    window.addEventListener("web3:transaction", (event) => {
      console.log("[Aegis/inpage] Web3 transaction event:", event.detail);
      post("Aegis/ApproveDetected", {
        title: "Web3 Transaction",
        body: "Transaction detected via Web3"
      });
    });
    const originalAddEventListener = window.addEventListener;
    window.addEventListener = function(type, listener, options) {
      if (type.includes("transaction") || type.includes("send") || type.includes("transfer")) {
        console.log("[Aegis/inpage] DEBUG - Window event listener added:", type);
      }
      return originalAddEventListener.call(this, type, listener, options);
    };
    window.addEventListener("beforeunload", () => {
      clearInterval(interval);
      observer.disconnect();
    });
  })();
})();
