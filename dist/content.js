// src/content.ts
console.log("[Rugsense/content] start", location.href);
if (location.href.startsWith("chrome://") || location.href.startsWith("chrome-extension://") || location.href.startsWith("moz-extension://")) {
  console.log(
    "[Rugsense/content] Skipping injection on internal page:",
    location.href
  );
  throw new Error("Cannot run on internal pages");
}
function injectInpageScript() {
  try {
    const existingScript = document.getElementById("rugsense-inpage-script");
    if (existingScript) {
      existingScript.remove();
    }
    const script = document.createElement("script");
    script.id = "rugsense-inpage-script";
    script.src = chrome.runtime.getURL("dist/inpage.js");
    script.onload = () => {
      console.log("[Rugsense/content] Inpage script injected successfully");
    };
    script.onerror = () => {
      console.warn(
        "[Rugsense/content] Inpage script failed to load, retrying..."
      );
      setTimeout(injectInpageScript, 100);
    };
    if (document.head) {
      document.head.appendChild(script);
    } else {
      document.documentElement.appendChild(script);
    }
  } catch (e) {
    console.warn("[Rugsense/content] Failed to inject inpage script:", e);
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
  chrome.runtime.sendMessage({ type: "Rugsense/ProgrammaticInject" });
} catch (e) {
  console.warn("[Rugsense/content] ProgrammaticInject request failed", e);
}
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.target !== "RugsenseInpage") return;
  console.log("[Rugsense/content] window message:", data.type, data.payload);
  forwardToBg(data);
});
document.addEventListener("RugsenseInpageEvent", (ev) => {
  const data = ev?.detail;
  if (!data) return;
  console.log("[Rugsense/content] DOM event:", data.type, data.payload);
  forwardToBg(data);
});
function forwardToBg(data) {
  if (data.type === "Rugsense/ApproveDetected") {
    chrome.runtime.sendMessage({
      type: "Rugsense/Notify",
      payload: data.payload
    });
  }
  if (data.type === "Rugsense/TrackAddress") {
    chrome.runtime.sendMessage({
      type: "Rugsense/AddAddress",
      address: data.address
    });
  }
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "Rugsense/ToggleDropdown") {
    console.log("[Rugsense/content] Toggle dropdown requested");
    if (typeof window.toggleRugsenseDropdown === "function") {
      console.log(
        "[Rugsense/content] Inpage script ready, calling toggle directly"
      );
      window.toggleRugsenseDropdown();
    } else {
      console.log(
        "[Rugsense/content] Inpage script not ready, sending message"
      );
      window.postMessage(
        { target: "RugsenseInpage", type: "Rugsense/ToggleDropdown" },
        "*"
      );
    }
    sendResponse({ ok: true });
  }
});
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.target !== "RugsenseContent") return;
  if (data.type === "Rugsense/GetAddresses") {
    chrome.storage.local.get({ addresses: [] }, (res) => {
      window.postMessage(
        {
          target: "RugsenseInpage",
          type: "Rugsense/AddressesResponse",
          addresses: res.addresses
        },
        "*"
      );
    });
  }
  if (data.type === "Rugsense/AddAddress") {
    chrome.storage.local.get({ addresses: [] }, (res) => {
      const addresses = res.addresses || [];
      if (!addresses.includes(data.address.toLowerCase())) {
        addresses.push(data.address.toLowerCase());
        chrome.storage.local.set({ addresses });
        console.log("[Rugsense/content] Address added:", data.address);
      }
    });
  }
  if (data.type === "Rugsense/RemoveAddress") {
    chrome.storage.local.get({ addresses: [] }, (res) => {
      const newAddresses = res.addresses.filter(
        (addr) => addr.toLowerCase() !== data.address.toLowerCase()
      );
      chrome.storage.local.set({ addresses: newAddresses });
    });
  }
});
