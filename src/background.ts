// src/background.ts
import {
  createPublicClient,
  webSocket,
  http,
  formatUnits,
  parseAbiItem,
} from 'viem';
import { sepolia } from 'viem/chains';

type Settings = { addresses: string[]; rpcUrl?: string };

// ERC20 Transfer(event) imzası
const TRANSFER = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

// viem client tekil instance
let client: ReturnType<typeof createPublicClient> | null = null;

async function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.local.get({ addresses: [], rpcUrl: undefined }, (res) =>
      resolve(res as Settings)
    );
  });
}

// WSS varsa onu, yoksa HTTP (fallback) kullan
async function ensureClient() {
  const { rpcUrl } = await getSettings();
  if (client) return client;

  const FALLBACK_WSS =
    'wss://sepolia.infura.io/ws/v3/7d3ce0c1cfa34bd4b3f5822a8c3f3bbc'; // kendi key’in
  const transport = rpcUrl
    ? rpcUrl.startsWith('wss:')
      ? webSocket(rpcUrl)
      : http(rpcUrl)
    : FALLBACK_WSS
    ? webSocket(FALLBACK_WSS)
    : http();

  client = createPublicClient({ chain: sepolia, transport });
  console.log(
    '[Rugsense/bg] client ready on sepolia, transport:',
    rpcUrl || FALLBACK_WSS || 'default-http'
  );
  return client;
}

function badgePing() {
  try {
    chrome.action.setBadgeText({ text: '!' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
  } catch {}
}

function notify(title: string, message: string) {
  const iconUrl = chrome.runtime.getURL('icons/icon128.png');
  console.log('[Rugsense/bg] notify:', { title, message, iconUrl });
  chrome.notifications.create(
    { type: 'basic', iconUrl, title, message, priority: 2 },
    () => {
      const err = chrome.runtime.lastError;
      if (err) console.error('[Rugsense/bg] notifications.create error:', err);
    }
  );
  badgePing();
}

// Adres bazlı Transfer event izleme
async function subscribeTransfers() {
  const c = await ensureClient();
  const { addresses } = await getSettings();

  if (!addresses.length) {
    console.warn('[Rugsense/bg] no addresses to watch');
    return;
  }

  // eski watcher’ları temizle
  (globalThis as any).__rugsense_unwatch =
    (globalThis as any).__rugsense_unwatch || [];
  (globalThis as any).__rugsense_unwatch.forEach((fn: any) => {
    try {
      fn?.();
    } catch {}
  });
  (globalThis as any).__rugsense_unwatch = [];

  const watched = Array.from(new Set(addresses.map((a) => a.toLowerCase())));
  console.log('[Rugsense/bg] setting watchers for:', watched);

  // her 'to' adresi için ayrı watcher
  for (const toAddr of watched) {
    const unwatch = c.watchEvent({
      event: TRANSFER,
      args: { to: toAddr as `0x${string}` },
      onLogs: (logs) => {
        console.log(
          '[Rugsense/bg] onLogs(to=',
          toAddr,
          ') count:',
          logs.length
        );
        logs.forEach((log) => {
          const from = String(log.args?.from || '');
          const value = log.args?.value as bigint;
          notify(
            'Token Received',
            `~${formatUnits(value, 18)} tokens from ${from.slice(
              0,
              6
            )}…${from.slice(-4)}`
          );
        });
      },
      onError: (e) =>
        console.error('[Rugsense/bg] watchEvent error for', toAddr, e),
    });
    (globalThis as any).__rugsense_unwatch.push(unwatch);
  }
}

// Content’ten gelen mesajlar
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[Rugsense/bg] onMessage:', msg);

  // Programatik injection (MAIN world) — sandbox/cross-origin iframeler için
  if (msg?.type === 'Rugsense/ProgrammaticInject') {
    const tabId = sender.tab?.id;
    const frameId = sender.frameId;

    if (tabId !== undefined) {
      chrome.scripting.executeScript(
        {
          target:
            frameId !== undefined
              ? { tabId, frameIds: [frameId] }
              : { tabId, allFrames: true },
          files: ['dist/inpage.js'],
          world: 'MAIN',
          injectImmediately: true,
        },
        () => {
          const err = chrome.runtime.lastError;
          if (err) console.error('[Rugsense/bg] executeScript error:', err);
          else
            console.log('[Rugsense/bg] inpage injected via scripting', {
              tabId,
              frameId,
            });
          sendResponse({ ok: !err });
        }
      );
      return true; // async
    } else {
      console.warn('[Rugsense/bg] ProgrammaticInject: no tabId');
      sendResponse({ ok: false });
      return;
    }
  }

  // Adres ekleme (popup/content)
  if (msg?.type === 'Rugsense/AddAddress') {
    const addr = String(msg.address).toLowerCase();
    chrome.storage.local.get({ addresses: [] }, (res) => {
      const set = new Set<string>(res.addresses);
      set.add(addr);
      chrome.storage.local.set({ addresses: [...set] }, () => {
        notify('Rugsense', `Monitoring ${addr}`);
        subscribeTransfers(); // yeni adres için watcher kur
        sendResponse({ ok: true });
      });
    });
    return true; // async
  }

  // Bildirim tetikleme (inpage → content → bg)
  if (msg?.type === 'Rugsense/Notify') {
    const { title, body } = msg.payload || {};
    notify(title || 'Rugsense', body || 'Event detected');
  }
});

// Extension icon click handler
chrome.action.onClicked.addListener((tab) => {
  if (tab.id && tab.url) {
    // Chrome internal sayfalarında çalışma
    if (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('moz-extension://')
    ) {
      console.log('[Rugsense/bg] Cannot inject into internal page:', tab.url);
      return;
    }

    console.log('[Rugsense/bg] Extension icon clicked, sending toggle message');
    chrome.tabs.sendMessage(
      tab.id,
      { type: 'Rugsense/ToggleDropdown' },
      (response) => {
        if (chrome.runtime.lastError) {
          console.log('[Rugsense/bg] Content script not ready, injecting...');
          chrome.scripting
            .executeScript({
              target: { tabId: tab.id },
              files: ['dist/content.js'],
            })
            .then(() => {
              console.log('[Rugsense/bg] Content script injected successfully');
              // Content script yüklendikten sonra mesaj gönder
              setTimeout(() => {
                chrome.tabs.sendMessage(
                  tab.id!,
                  { type: 'Rugsense/ToggleDropdown' },
                  (response) => {
                    if (chrome.runtime.lastError) {
                      console.log(
                        "[Rugsense/bg] Still can't reach content script:",
                        chrome.runtime.lastError.message
                      );
                    } else {
                      console.log(
                        '[Rugsense/bg] Toggle message sent after injection'
                      );
                    }
                  }
                );
              }, 200);
            })
            .catch((error) => {
              console.log(
                '[Rugsense/bg] Failed to inject content script:',
                error
              );
            });
        } else {
          console.log('[Rugsense/bg] Toggle message sent successfully');
        }
      }
    );
  }
});

// başlat
subscribeTransfers();
