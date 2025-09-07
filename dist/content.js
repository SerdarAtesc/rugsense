// src/content.ts
console.log("[Aegis/content] start", location.href);
if (location.href.startsWith("chrome://") || location.href.startsWith("chrome-extension://") || location.href.startsWith("moz-extension://")) {
  console.log("[Aegis/content] Skipping injection on internal page:", location.href);
  throw new Error("Cannot run on internal pages");
}
function injectInpageScript() {
  try {
    const existingScript = document.getElementById("aegis-inpage-script");
    if (existingScript) {
      existingScript.remove();
    }
    const script = document.createElement("script");
    script.id = "aegis-inpage-script";
    script.src = chrome.runtime.getURL("dist/inpage.js");
    script.onload = () => {
      console.log("[Aegis/content] Inpage script injected successfully");
    };
    script.onerror = () => {
      console.warn("[Aegis/content] Inpage script failed to load, retrying...");
      setTimeout(injectInpageScript, 100);
    };
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
injectInpageScript();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectInpageScript);
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
document.addEventListener("AegisInpageEvent", (ev) => {
  const data = ev?.detail;
  if (!data) return;
  console.log("[Aegis/content] DOM event:", data.type, data.payload);
  forwardToBg(data);
});
function forwardToBg(data) {
  if (data.type === "Aegis/ApproveDetected") {
    chrome.runtime.sendMessage({ type: "Aegis/Notify", payload: data.payload });
  }
  if (data.type === "Aegis/TrackAddress") {
    chrome.runtime.sendMessage({ type: "Aegis/AddAddress", address: data.address });
  }
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "Aegis/ToggleDropdown") {
    console.log("[Aegis/content] Toggle dropdown requested");
    if (typeof window.toggleAegisDropdown === "function") {
      console.log("[Aegis/content] Inpage script ready, calling toggle directly");
      window.toggleAegisDropdown();
    } else {
      console.log("[Aegis/content] Inpage script not ready, sending message");
      window.postMessage({ target: "AegisInpage", type: "Aegis/ToggleDropdown" }, "*");
    }
    sendResponse({ ok: true });
  }
});
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.target !== "AegisContent") return;
  if (data.type === "Aegis/GetAddresses") {
    chrome.storage.local.get({ addresses: [] }, (res) => {
      window.postMessage({
        target: "AegisInpage",
        type: "Aegis/AddressesResponse",
        addresses: res.addresses
      }, "*");
    });
  }
  if (data.type === "Aegis/AddAddress") {
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
    chrome.storage.local.get({ addresses: [] }, (res) => {
      const newAddresses = res.addresses.filter(
        (addr) => addr.toLowerCase() !== data.address.toLowerCase()
      );
      chrome.storage.local.set({ addresses: newAddresses });
    });
  }
});
