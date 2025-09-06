console.log("[Aegis/content] start", location.href);

// Inpage script'i hemen inject et
try {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('dist/inpage.js');
  script.onload = () => {
    console.log("[Aegis/content] Inpage script injected successfully");
  };
  (document.head || document.documentElement).appendChild(script);
} catch (e) {
  console.warn("[Aegis/content] Failed to inject inpage script:", e);
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
  if (msg.type === "Aegis/ToggleDropdown") {
    console.log("[Aegis/content] Toggle dropdown requested");
    
    // Inpage script'in yüklenip yüklenmediğini kontrol et
    if (typeof (window as any).toggleAegisDropdown === 'function') {
      console.log("[Aegis/content] Inpage script ready, calling toggle directly");
      (window as any).toggleAegisDropdown();
    } else {
      console.log("[Aegis/content] Inpage script not ready, sending message");
      // Inpage script'e mesaj gönder
      window.postMessage({ target: "AegisInpage", type: "Aegis/ToggleDropdown" }, "*");
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