console.log("[Aegis/content] start", location.href);

// Chrome internal sayfalarında çalışma
if (location.href.startsWith('chrome://') || location.href.startsWith('chrome-extension://') || location.href.startsWith('moz-extension://')) {
  console.log("[Aegis/content] Skipping injection on internal page:", location.href);
  // Internal sayfalarda çalışmayı durdur
  throw new Error("Cannot run on internal pages");
}

// Inpage script'i hemen inject et - agresif yaklaşım
function injectInpageScript() {
  try {
    // Mevcut script'i kaldır
    const existingScript = document.getElementById('aegis-inpage-script');
    if (existingScript) {
      existingScript.remove();
    }
    
    const script = document.createElement('script');
    script.id = 'aegis-inpage-script';
    script.src = chrome.runtime.getURL('dist/inpage.js');
    script.onload = () => {
      console.log("[Aegis/content] Inpage script injected successfully");
    };
    script.onerror = () => {
      console.warn("[Aegis/content] Inpage script failed to load, retrying...");
      setTimeout(injectInpageScript, 100);
    };
    
    // Head'e ekle, yoksa documentElement'e
    if (document.head) {
      document.head.appendChild(script);
    } else {
      document.documentElement.appendChild(script);
    }
  } catch (e) {
    console.warn("[Aegis/content] Failed to inject inpage script:", e);
    setTimeout(injectInpageScript, 100);
  }
}

// Hemen inject et
injectInpageScript();

// DOM ready olduğunda da inject et (yedek)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectInpageScript);
} else {
  injectInpageScript();
}

try {
  chrome.runtime.sendMessage({ type: "Aegis/ProgrammaticInject" });
} catch (e) {
  console.warn("[Aegis/content] ProgrammaticInject request failed", e);
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.target !== "AegisInpage") return;
  console.log("[Aegis/content] window message:", data.type, data.payload);
  forwardToBg(data);
});

document.addEventListener("AegisInpageEvent" as any, (ev: any) => {
  const data = ev?.detail;
  if (!data) return;
  console.log("[Aegis/content] DOM event:", data.type, data.payload);
  forwardToBg(data);
});

function forwardToBg(data: any) {
  if (data.type === "Aegis/ApproveDetected") {
    chrome.runtime.sendMessage({ type: "Aegis/Notify", payload: data.payload });
  }
  if (data.type === "Aegis/TrackAddress") {
    chrome.runtime.sendMessage({ type: "Aegis/AddAddress", address: data.address });
  }
}

// Background'dan gelen mesajları dinle
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "Rugsense/ToggleDropdown") {
    console.log("[Rugsense/content] Toggle dropdown requested");
    
    // Inpage script'in yüklenip yüklenmediğini kontrol et
    if (typeof (window as any).toggleRugsenseDropdown === 'function') {
      console.log("[Rugsense/content] Inpage script ready, calling toggle directly");
      (window as any).toggleRugsenseDropdown();
    } else {
      console.log("[Rugsense/content] Inpage script not ready, sending message");
      // Inpage script'e mesaj gönder
      window.postMessage({ target: "RugsenseInpage", type: "Rugsense/ToggleDropdown" }, "*");
    }
    sendResponse({ ok: true });
  }
});

// Inpage script'ten gelen mesajları dinle
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.target !== "AegisContent") return;
  
  if (data.type === "Aegis/GetAddresses") {
    // Chrome storage'dan adresleri al
    chrome.storage.local.get({ addresses: [] }, (res) => {
      window.postMessage({ 
        target: "AegisInpage", 
        type: "Aegis/AddressesResponse", 
        addresses: res.addresses 
      }, "*");
    });
  }
  
  if (data.type === "Aegis/AddAddress") {
    // Adres ekle
    chrome.storage.local.get({ addresses: [] }, (res) => {
      const addresses = res.addresses || [];
      if (!addresses.includes(data.address.toLowerCase())) {
        addresses.push(data.address.toLowerCase());
        chrome.storage.local.set({ addresses });
        console.log("[Aegis/content] Address added:", data.address);
      }
    });
  }
  
  if (data.type === "Aegis/RemoveAddress") {
    // Adresi kaldır
    chrome.storage.local.get({ addresses: [] }, (res) => {
      const newAddresses = res.addresses.filter((addr: string) => 
        addr.toLowerCase() !== data.address.toLowerCase()
      );
      chrome.storage.local.set({ addresses: newAddresses });
    });
  }
});