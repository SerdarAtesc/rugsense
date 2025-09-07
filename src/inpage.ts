// src/inpage.ts
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';

(() => {
  // Duplicate injection kontrolü
  if ((window as any).__RUGSENSE_INPAGE_LOADED) {
    console.log('[Rugsense/inpage] Already loaded, skipping');
    return;
  }
  (window as any).__RUGSENSE_INPAGE_LOADED = true;

  console.log('[Rugsense/inpage] init', location.href);

  // Extension URL helper function
  function getExtensionURL(path: string): string {
    // Try to get extension ID from various sources
    const scripts = document.querySelectorAll('script[src*="inpage.js"]');
    if (scripts.length > 0) {
      const scriptSrc = (scripts[0] as HTMLScriptElement).src;
      const match = scriptSrc.match(/chrome-extension:\/\/([^\/]+)/);
      if (match) {
        return `chrome-extension://${match[1]}/${path}`;
      }
    }
    // Fallback to relative path
    return path;
  }

  let trackedAddresses: string[] = [];
  let recentTransactions: Array<{
    type: string;
    address: string;
    timestamp: number;
    details: any;
  }> = [];

  // Contract verification cache ve request tracking
  const verificationCache = new Map<string, any>();
  const pendingRequests = new Set<string>();

  // AI Security Analysis cache
  const securityAnalysisCache = new Map<string, any>();
  const lastAIRequest = new Map<string, number>(); // Rate limiting için

  // Rate limiting için
  let lastAIRequestTime = 0;
  const AI_REQUEST_COOLDOWN = 30000; // 30 saniye bekle
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;

  // Aptos Blockchain Integration
  const APTOS_CONTRACT_ADDRESS =
    '0x35b28662b4657b901cb36a37af124cc4d9eb067d654ad9ca68e9aedd376be5cf';
  const APTOS_NETWORK = 'testnet';
  let aptosClient: any = null;
  let aptosWallet: any = null;
  let connectedWalletAddress: string | null = null;

  // Wallet storage fonksiyonları
  function saveWalletAddress(address: string) {
    localStorage.setItem('rugsense_aptos_wallet', address);
    connectedWalletAddress = address;
    console.log(`[Rugsense/Aptos] Wallet address saved: ${address}`);
  }

  function loadWalletAddress(): string | null {
    const saved = localStorage.getItem('rugsense_aptos_wallet');
    if (saved) {
      connectedWalletAddress = saved;
      console.log(`[Rugsense/Aptos] Wallet address loaded: ${saved}`);
    }
    return saved;
  }

  function clearWalletAddress() {
    localStorage.removeItem('rugsense_aptos_wallet');
    connectedWalletAddress = null;
    console.log(`[Rugsense/Aptos] Wallet address cleared`);
  }

  // Sayfa yüklendiğinde wallet'ı kontrol et
  loadWalletAddress();

  // Aptos SDK'yı initialize et (NPM'den import edilen)
  async function initializeAptosClient() {
    try {
      console.log('[Rugsense/Aptos] Initializing Aptos client from NPM...');

      // NPM'den import edilen SDK'yı kullan
      const config = new AptosConfig({ network: Network.TESTNET });
      aptosClient = new Aptos(config);
      console.log('[Rugsense/Aptos] Client initialized successfully from NPM');
    } catch (error) {
      console.error('[Rugsense/Aptos] Error initializing client:', error);
      aptosClient = 'wallet_only';
      console.log('[Rugsense/Aptos] Falling back to wallet-only mode');
    }
  }

  // SDK'yı initialize et
  initializeAptosClient();

  // Contract hash hesaplama
  async function calculateContractHash(
    contractAddress: string
  ): Promise<string> {
    try {
      // Basit hash hesaplama (gerçek uygulamada daha karmaşık olabilir)
      const encoder = new TextEncoder();
      const data = encoder.encode(contractAddress + Date.now().toString());
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.error('[Rugsense/Aptos] Error calculating hash:', error);
      return contractAddress.replace('0x', '').toLowerCase();
    }
  }

  // Blockchain'de daha önce analiz edilip edilmediğini kontrol et
  async function checkBlockchainCache(
    contractAddress: string
  ): Promise<boolean> {
    try {
      const contractHash = await calculateContractHash(contractAddress);
      console.log(
        `[Rugsense/Aptos] Checking blockchain cache for contract: ${contractAddress} (hash: ${contractHash})`
      );

      // Şimdilik her zaman false döndür (henüz wallet connection yok)
      // Gerçek implementasyonda Aptos contract'ından kontrol edilecek
      return false;
    } catch (error) {
      console.error('[Rugsense/Aptos] Error checking blockchain cache:', error);
      return false;
    }
  }

  // Blockchain'e analysis gönder
  async function submitAnalysisToBlockchain(
    contractAddress: string,
    analysisResult: any
  ) {
    try {
      // Önce blockchain cache'de kontrol et
      const alreadyAnalyzed = await checkBlockchainCache(contractAddress);
      if (alreadyAnalyzed) {
        console.log(
          `[Rugsense/Aptos] Contract already analyzed on blockchain: ${contractAddress}`
        );
        return {
          contractHash: await calculateContractHash(contractAddress),
          status: 'already_analyzed',
          message: 'Contract already analyzed on blockchain',
        };
      }

      if (!aptosClient && !connectedWalletAddress) {
        console.log(
          '[Rugsense/Aptos] No client or wallet, skipping blockchain submission'
        );
        return null;
      }

      const contractHash = await calculateContractHash(contractAddress);

      // Verileri kısalt
      const shortSummary = 'Test'; // Minimal data

      // Contract ID'yi string olarak kullan
      const contractId = contractAddress; // Contract address'i ID olarak kullan

      // Transaction payload'ı wallet format'ına çevir
      const payload = {
        type: 'entry_function_payload',
        function: `${APTOS_CONTRACT_ADDRESS}::AnalysisRegistry::submit_analysis`,
        arguments: [
          contractId, // String format
          'LOW', // String format
          'Test', // String format
        ],
        type_arguments: [],
        max_gas_amount: '100000000',
        gas_unit_price: '100',
        expiration_timestamp_secs: Math.floor(Date.now() / 1000) + 1800000, // 30 dakika sonra expire
      };

      console.log('[Rugsense/Aptos] Submitting to blockchain:', payload);

      // Gerçek blockchain transaction yap
      try {
        // Tüm wallet'ları kontrol et
        let aptosWallet = null;
        if (typeof window !== 'undefined') {
          if ((window as any).aptos) {
            aptosWallet = (window as any).aptos; // Petra
            console.log('[Rugsense/Aptos] Using Petra wallet for transaction');
          } else if ((window as any).martian) {
            aptosWallet = (window as any).martian; // Martian
            console.log(
              '[Rugsense/Aptos] Using Martian wallet for transaction'
            );
          } else if ((window as any).pontem) {
            aptosWallet = (window as any).pontem; // Pontem
            console.log('[Rugsense/Aptos] Using Pontem wallet for transaction');
          } else if ((window as any).fewcha) {
            aptosWallet = (window as any).fewcha; // Fewcha
            console.log('[Rugsense/Aptos] Using Fewcha wallet for transaction');
          } else if ((window as any).rise) {
            aptosWallet = (window as any).rise; // Rise
            console.log('[Rugsense/Aptos] Using Rise wallet for transaction');
          }
        }

        if (aptosWallet && connectedWalletAddress) {
          console.log(
            '[Rugsense/Aptos] Submitting transaction with wallet:',
            connectedWalletAddress
          );
          console.log('[Rugsense/Aptos] Transaction payload:', payload);

          // Direkt analysis transaction'ını gönder
          console.log(
            '[Rugsense/Aptos] Sending analysis transaction directly...'
          );
          const txHash = await aptosWallet.signAndSubmitTransaction(payload);
          console.log(
            '[Rugsense/Aptos] Analysis transaction submitted successfully:',
            txHash
          );

          return {
            contractHash,
            rewardAmount: '0.01 APT (testnet)',
            status: 'submitted',
            transactionHash: txHash,
          };
        } else {
          // Wallet yoksa sadece log'la
          console.log(
            '[Rugsense/Aptos] Wallet not connected, analysis ready for submission:',
            {
              contractHash,
              riskLevel: analysisResult.riskLevel,
              rewardAmount: '0.01 APT (testnet)',
            }
          );

          return {
            contractHash,
            rewardAmount: '0.01 APT (testnet)',
            status: 'ready_for_wallet',
          };
        }
      } catch (walletError) {
        console.error(
          '[Rugsense/Aptos] Wallet transaction error:',
          walletError
        );
        return {
          contractHash,
          rewardAmount: '0.01 APT (testnet)',
          status: 'wallet_error',
          error: walletError.message,
        };
      }
    } catch (error) {
      console.error('[Rugsense/Aptos] Error submitting to blockchain:', error);
      return null;
    }
  }

  // Global toggle fonksiyonunu hemen tanımla
  (window as any).toggleRugsenseDropdown = () => {
    const dropdown = document.getElementById('rugsense-dropdown');
    if (dropdown) {
      const isVisible = dropdown.classList.contains('rugsense-visible');
      if (isVisible) {
        dropdown.classList.remove('rugsense-visible');
        dropdown.style.display = 'none';
        console.log('[Rugsense/inpage] Dropdown hidden');
      } else {
        dropdown.classList.add('rugsense-visible');
        dropdown.style.display = 'block';
        console.log('[Rugsense/inpage] Dropdown shown');
      }
    } else {
      console.log('[Rugsense/inpage] Dropdown not found, creating...');
      createDropdownUI();
    }
  };

  // DOM hazır olduğunda dropdown'ı oluştur
  function initDropdown() {
    if (document.head && document.body) {
      createDropdownUI();
    } else {
      // DOM henüz hazır değil, bekle
      setTimeout(initDropdown, 50);
    }
  }

  // Hemen dene, yoksa bekle
  initDropdown();

  // Selector sabitleri (kullanılmıyor ama referans için bırakıldı)
  // const APPROVE = "0x095ea7b3";             // approve(address,uint256)
  // const SET_APPROVAL_FOR_ALL = "0xa22cb465"; // setApprovalForAll(address,bool)
  // const PERMIT_PREFIXES = ["0xd505accf", "0x8fcbaf0c"]; // yaygın permit selector'ları

  // Hook'lanan provider'ları takip etmek için
  const HOOKED = new WeakSet<any>();
  const ORIGINALS = new WeakMap<any, Function>(); // provider -> orijinal request
  const LAST_SIG = new WeakMap<any, string>(); // provider -> request.toString() imzası (değişirse yeniden hook)

  // Takip edilen adresleri al - content script üzerinden
  async function getTrackedAddresses() {
    return new Promise<string[]>((resolve) => {
      try {
        // Content script'e mesaj gönder
        window.postMessage(
          { target: 'RugsenseContent', type: 'Rugsense/GetAddresses' },
          '*'
        );

        // Response'u dinle
        const handleResponse = (event: MessageEvent) => {
          if (event.source !== window) return;
          const data = event.data;
          if (
            data &&
            data.target === 'RugsenseInpage' &&
            data.type === 'Rugsense/AddressesResponse'
          ) {
            trackedAddresses = (data.addresses || []).map((addr: string) =>
              addr.toLowerCase()
            );
            console.log(
              '[Rugsense/inpage] Tracked addresses loaded:',
              trackedAddresses
            );
            window.removeEventListener('message', handleResponse);
            updateTrackedAddresses();
            resolve(trackedAddresses);
          }
        };

        window.addEventListener('message', handleResponse);

        // Timeout fallback
        setTimeout(() => {
          window.removeEventListener('message', handleResponse);
          resolve([]);
        }, 1000);
      } catch (e) {
        console.error('[Rugsense/inpage] Get addresses error:', e);
        resolve([]);
      }
    });
  }

  // Contract verification kontrolü - gelişmiş (cache ve duplicate request handling ile)
  async function checkContractVerification(contractAddress: string): Promise<{
    isVerified: boolean;
    contractName?: string;
    compilerVersion?: string;
    sourceCode?: string;
    abi?: string;
    network?: string;
  }> {
    try {
      // Cache kontrolü - 5 dakika cache
      const cacheKey = contractAddress.toLowerCase();
      const cached = verificationCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 300000) {
        // 5 dakika
        console.log(
          `[Rugsense/inpage] Using cached verification for ${contractAddress}`
        );
        return cached.result;
      }

      // Duplicate request kontrolü
      if (pendingRequests.has(cacheKey)) {
        console.log(
          `[Rugsense/inpage] Request already pending for ${contractAddress}, waiting...`
        );
        // Pending request bitene kadar bekle
        return new Promise((resolve) => {
          const checkPending = () => {
            if (!pendingRequests.has(cacheKey)) {
              const cached = verificationCache.get(cacheKey);
              if (cached) {
                resolve(cached.result);
              } else {
                resolve({ isVerified: false, network: 'unknown' });
              }
            } else {
              setTimeout(checkPending, 100);
            }
          };
          checkPending();
        });
      }

      // Request'i pending olarak işaretle
      pendingRequests.add(cacheKey);
      console.log(
        `[Rugsense/inpage] Starting verification check for ${contractAddress}`
      );
      // Network detection - hangi network'te olduğumuzu tespit et
      let apiUrl = '';
      let network = 'unknown';

      // window.ethereum'dan chainId al
      if ((window as any).ethereum) {
        try {
          const chainId = await (window as any).ethereum.request({
            method: 'eth_chainId',
          });
          const chainIdNum = parseInt(chainId, 16);

          switch (chainIdNum) {
            case 1: // Mainnet
              apiUrl = 'https://api.etherscan.io/api';
              network = 'mainnet';
              break;
            case 11155111: // Sepolia
              apiUrl = 'https://api-sepolia.etherscan.io/api';
              network = 'sepolia';
              break;
            case 5: // Goerli
              apiUrl = 'https://api-goerli.etherscan.io/api';
              network = 'goerli';
              break;
            case 137: // Polygon
              apiUrl = 'https://api.polygonscan.com/api';
              network = 'polygon';
              break;
            case 56: // BSC
              apiUrl = 'https://api.bscscan.com/api';
              network = 'bsc';
              break;
            default:
              apiUrl = 'https://api.etherscan.io/api'; // Default to mainnet
              network = 'mainnet';
          }
        } catch (e) {
          // Fallback to mainnet
          apiUrl = 'https://api.etherscan.io/api';
          network = 'mainnet';
        }
      } else {
        // Fallback to mainnet
        apiUrl = 'https://api.etherscan.io/api';
        network = 'mainnet';
      }

      console.log(
        `[Rugsense/inpage] Checking contract verification on ${network}:`,
        contractAddress
      );

      // Etherscan API ile contract verification kontrolü
      const response = await fetch(
        `${apiUrl}?module=contract&action=getsourcecode&address=${contractAddress}&apikey=UAPHPG82Y8VXRRF8XKQPXBTEFJCHGR5VUD`
      );
      const data = await response.json();

      if (data.status === '1' && data.result && data.result[0]) {
        const contractInfo = data.result[0];

        // Source code kontrolü - daha detaylı
        let isVerified = false;
        let sourceCode = contractInfo.SourceCode || '';

        if (sourceCode && sourceCode !== '') {
          // Source code var mı kontrol et
          if (sourceCode.length > 10) {
            // En az 10 karakter olmalı
            isVerified = true;
          }

          // Eğer JSON formatında ise (multi-file contract)
          if (sourceCode.startsWith('{')) {
            try {
              const parsed = JSON.parse(sourceCode);
              if (parsed.sources && Object.keys(parsed.sources).length > 0) {
                isVerified = true;
              }
            } catch (e) {
              // JSON parse hatası, normal string olarak kabul et
              isVerified = sourceCode.length > 10;
            }
          }
        }

        console.log(`[Rugsense/inpage] Source code check:`, {
          hasSourceCode: !!sourceCode,
          sourceCodeLength: sourceCode.length,
          sourceCodePreview: sourceCode.substring(0, 100),
          isVerified,
        });

        // Source code'u console'a bas
        if (sourceCode && sourceCode.length > 0) {
          console.log(
            `[Rugsense/inpage] ===== SOURCE CODE FOR ${contractAddress} =====`
          );
          console.log(sourceCode);
          console.log(`[Rugsense/inpage] ===== END SOURCE CODE =====`);

          // AI güvenlik analizi başlat (sadece tracked address'ler için)
          // Not: Bu kısım sadece console log için, gerçek analysis tracked transaction'larda yapılıyor
          console.log(
            `[Rugsense/inpage] AI analysis will be performed only for tracked address transactions`
          );
        }

        const result = {
          isVerified,
          contractName: contractInfo.ContractName || 'Unknown',
          compilerVersion: contractInfo.CompilerVersion || 'Unknown',
          sourceCode: sourceCode,
          abi: contractInfo.ABI || '',
          network,
        };

        console.log(`[Rugsense/inpage] Contract verification result:`, result);

        // Cache'e kaydet
        verificationCache.set(cacheKey, {
          result: result,
          timestamp: Date.now(),
        });

        // Pending request'i temizle
        pendingRequests.delete(cacheKey);

        return result;
      }

      const fallbackResult = {
        isVerified: false,
        network,
      };

      // Cache'e kaydet (negative result da cache'lenir)
      verificationCache.set(cacheKey, {
        result: fallbackResult,
        timestamp: Date.now(),
      });

      // Pending request'i temizle
      pendingRequests.delete(cacheKey);

      return fallbackResult;
    } catch (e) {
      console.error('[Rugsense/inpage] Contract verification check error:', e);

      const errorResult = {
        isVerified: false,
        network: 'unknown',
      };

      // Pending request'i temizle
      pendingRequests.delete(cacheKey);

      return errorResult;
    }
  }

  // Pattern-based Security Analysis fonksiyonu (gelişmiş)
  function getPatternBasedAnalysis(sourceCode: string) {
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    const issues: string[] = [];
    const recommendations: string[] = [];

    // 1. Reentrancy Risk Patterns
    if (sourceCode.includes('call(') || sourceCode.includes('delegatecall(')) {
      issues.push('External call detected - potential reentrancy risk');
      riskLevel = 'HIGH';
      recommendations.push('Use checks-effects-interactions pattern');
      recommendations.push('Implement reentrancy guards');
    }

    // 2. Self-destruct Risk
    if (
      sourceCode.includes('selfdestruct(') ||
      sourceCode.includes('suicide(')
    ) {
      issues.push('Self-destruct function detected - high risk');
      riskLevel = 'CRITICAL';
      recommendations.push('Avoid self-destruct unless absolutely necessary');
      recommendations.push('Implement proper access controls');
    }

    // 3. Assembly Code Risk
    if (sourceCode.includes('assembly')) {
      issues.push('Assembly code detected - requires careful review');
      if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
      recommendations.push('Review assembly code thoroughly');
      recommendations.push('Consider using higher-level Solidity');
    }

    // 4. Delegatecall Risk
    if (sourceCode.includes('delegatecall(')) {
      issues.push('Delegatecall detected - high risk of proxy attacks');
      riskLevel = 'HIGH';
      recommendations.push('Validate delegatecall targets');
      recommendations.push('Use proxy patterns carefully');
    }

    // 5. tx.origin Risk
    if (sourceCode.includes('tx.origin')) {
      issues.push('tx.origin usage detected - potential phishing risk');
      if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
      recommendations.push('Use msg.sender instead of tx.origin');
    }

    // 6. Block Timestamp Risk
    if (sourceCode.includes('block.timestamp')) {
      issues.push(
        'Block timestamp usage detected - potential manipulation risk'
      );
      if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
      recommendations.push('Be cautious with block.timestamp dependencies');
    }

    // 7. Unchecked External Calls
    if (sourceCode.includes('transfer(') && !sourceCode.includes('require(')) {
      issues.push('Unchecked transfer calls detected');
      if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
      recommendations.push('Check transfer return values');
    }

    // 8. Integer Overflow/Underflow
    if (
      sourceCode.includes('+') ||
      sourceCode.includes('-') ||
      sourceCode.includes('*') ||
      sourceCode.includes('/')
    ) {
      if (
        !sourceCode.includes('SafeMath') &&
        !sourceCode.includes('unchecked')
      ) {
        issues.push(
          'Arithmetic operations without SafeMath - potential overflow risk'
        );
        if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
        recommendations.push('Use SafeMath or Solidity 0.8+ built-in checks');
      }
    }

    // 9. Access Control Issues
    if (sourceCode.includes('onlyOwner') || sourceCode.includes('onlyAdmin')) {
      if (!sourceCode.includes('modifier') && !sourceCode.includes('require')) {
        issues.push('Access control functions without proper modifiers');
        if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
        recommendations.push('Implement proper access control modifiers');
      }
    }

    // 10. Gas Limit Issues
    if (sourceCode.includes('for(') || sourceCode.includes('while(')) {
      issues.push('Loop detected - potential gas limit issues');
      if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
      recommendations.push('Consider gas limits in loops');
      recommendations.push('Use pagination for large datasets');
    }

    // Default recommendations
    if (recommendations.length === 0) {
      recommendations.push('Review contract source code manually');
      recommendations.push('Check for recent security audits');
      recommendations.push('Verify contract functionality');
      recommendations.push('Start with small test amounts');
    }

    return {
      riskLevel,
      issues:
        issues.length > 0 ? issues : ['No obvious security patterns detected'],
      summary: `Pattern-based security analysis completed. Risk level: ${riskLevel}. ${issues.length} potential issues found.`,
      recommendations,
    };
  }

  // AI Security Analysis fonksiyonu
  async function analyzeContractSecurity(
    contractAddress: string,
    sourceCode: string
  ): Promise<{
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    issues: string[];
    summary: string;
    recommendations: string[];
  }> {
    try {
      // Cache kontrolü - 2 saat cache
      const cacheKey = `security_${contractAddress.toLowerCase()}`;
      const cached = securityAnalysisCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 7200000) {
        // 2 saat cache
        console.log(
          `[Rugsense/inpage] Using cached security analysis for ${contractAddress}`
        );
        return cached.result;
      }

      // Source code yoksa basic analysis yap
      if (!sourceCode || sourceCode.trim() === '') {
        console.log(
          `[Rugsense/inpage] No source code available for ${contractAddress}, running basic analysis`
        );
        const basicAnalysis = {
          riskLevel: 'MEDIUM' as const,
          issues: [
            'Contract source code not available',
            'Unable to perform detailed security analysis',
          ],
          summary:
            'Contract is unverified - source code not available for analysis',
          recommendations: [
            'Verify contract source code on Etherscan',
            'Review contract bytecode manually',
            'Start with small test amounts',
            'Check contract on multiple block explorers',
          ],
        };

        // Cache'e kaydet
        securityAnalysisCache.set(cacheKey, {
          result: basicAnalysis,
          timestamp: Date.now(),
        });

        // Blockchain'e gönder (source code yoksa da)
        console.log(
          `[Rugsense/Aptos] No source code, submitting basic analysis to blockchain: ${contractAddress}`
        );
        console.log(
          `[Rugsense/Aptos] DEBUG - Wallet connected: ${!!connectedWalletAddress}, Address: ${connectedWalletAddress}`
        );
        const blockchainResult = await submitAnalysisToBlockchain(
          contractAddress,
          basicAnalysis
        );
        if (blockchainResult) {
          console.log(
            `[Rugsense/Aptos] Blockchain submission result (no source):`,
            blockchainResult
          );
        } else {
          console.log(
            `[Rugsense/Aptos] Blockchain submission failed (no source)`
          );
        }

        return basicAnalysis;
      }

      // Rate limiting kontrolü
      const now = Date.now();
      if (now - lastAIRequestTime < AI_REQUEST_COOLDOWN) {
        console.log(
          `[Rugsense/inpage] Rate limit: Too many AI requests, using fallback analysis`
        );
        return {
          riskLevel: 'MEDIUM' as const,
          issues: ['AI analysis rate limited - manual review recommended'],
          summary:
            'Rate limited: Unable to perform AI analysis. Manual code review recommended.',
          recommendations: [
            'Review contract source code manually',
            'Check for known security patterns',
            'Verify contract functionality',
            'Start with small test amounts',
          ],
        };
      }

      // Consecutive failures kontrolü
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.log(
          `[Rugsense/inpage] Too many consecutive failures (${consecutiveFailures}), using fallback analysis`
        );
        return {
          riskLevel: 'MEDIUM' as const,
          issues: ['AI analysis temporarily disabled due to failures'],
          summary:
            'AI analysis disabled: Multiple consecutive failures detected.',
          recommendations: [
            'Review contract source code manually',
            'Check for known security patterns',
            'Verify contract functionality',
            'Start with small test amounts',
          ],
        };
      }

      lastAIRequestTime = now;

      console.log(
        `[Rugsense/inpage] Starting AI security analysis for ${contractAddress}`
      );

      // OpenAI API ile güvenlik analizi (ücretsiz alternatif: Hugging Face API)
      const analysisPrompt = `
Analyze this Solidity smart contract for security vulnerabilities and risks. Provide a JSON response with the following structure:

{
  "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL",
  "issues": ["list of specific security issues found"],
  "summary": "brief summary of the contract's security status",
  "recommendations": ["list of security recommendations"]
}

Focus on:
- Reentrancy attacks
- Integer overflow/underflow
- Access control issues
- External calls
- Gas limit issues
- Front-running vulnerabilities
- Logic errors
- Unchecked external calls

Contract Source Code:
${sourceCode.substring(0, 4000)} // Limit to 4000 chars for API
`;

      // AI analysis devre dışı - sadece pattern-based analysis (hızlı ve güvenilir)
      console.log(
        `[Rugsense/inpage] Using pattern-based analysis for ${contractAddress} (AI disabled due to timeout issues)`
      );

      // Pattern-based analysis döndür
      const analysisResult = getPatternBasedAnalysis(sourceCode);

      // Blockchain'e gönder (tracked address ise)
      console.log(
        `[Rugsense/Aptos] DEBUG - Contract address: ${contractAddress}`
      );
      console.log(
        `[Rugsense/Aptos] DEBUG - Tracked addresses:`,
        trackedAddresses
      );
      console.log(
        `[Rugsense/Aptos] DEBUG - Is tracked:`,
        trackedAddresses.includes(contractAddress.toLowerCase())
      );

      // Tracked wallet'dan transaction varsa, contract'ı blockchain'e gönder
      // Contract'ı track etmiyoruz, sadece analiz ediyoruz
      // Blockchain'e gönder (tracked address ise)
      console.log(
        `[Rugsense/Aptos] Tracked wallet transaction detected, submitting contract analysis to blockchain: ${contractAddress}`
      );
      console.log(
        `[Rugsense/Aptos] DEBUG - Wallet connected: ${!!connectedWalletAddress}, Address: ${connectedWalletAddress}`
      );
      const blockchainResult = await submitAnalysisToBlockchain(
        contractAddress,
        analysisResult
      );
      if (blockchainResult) {
        console.log(
          `[Rugsense/Aptos] Blockchain submission result:`,
          blockchainResult
        );
      } else {
        console.log(`[Rugsense/Aptos] Blockchain submission failed`);
      }

      return analysisResult;
    } catch (error) {
      console.error(`[Rugsense/inpage] Pattern-based analysis error:`, error);
      const analysisResult = getPatternBasedAnalysis(sourceCode);

      // Blockchain'e gönder (tracked address ise)
      console.log(
        `[Rugsense/Aptos] DEBUG (catch) - Contract address: ${contractAddress}`
      );
      console.log(
        `[Rugsense/Aptos] DEBUG (catch) - Tracked addresses:`,
        trackedAddresses
      );
      console.log(
        `[Rugsense/Aptos] DEBUG (catch) - Is tracked:`,
        trackedAddresses.includes(contractAddress.toLowerCase())
      );

      // Tracked wallet'dan transaction varsa, contract'ı blockchain'e gönder
      console.log(
        `[Rugsense/Aptos] Tracked wallet transaction detected (catch), submitting contract analysis to blockchain: ${contractAddress}`
      );
      const blockchainResult = await submitAnalysisToBlockchain(
        contractAddress,
        analysisResult
      );
      if (blockchainResult) {
        console.log(
          `[Rugsense/Aptos] Blockchain submission ready:`,
          blockchainResult
        );
      }

      return analysisResult;
    }
  }

  // Yardımcılar
  function short(a?: string) {
    return a ? a.slice(0, 6) + '…' + a.slice(-4) : 'unknown';
  }
  function post(type: string, payload: any) {
    const packet = {
      target: 'RugsenseInpage',
      type,
      payload,
      address: payload?.address,
    };
    console.log('[Rugsense/inpage] post:', type, payload);

    // Kanal 1: window.postMessage
    try {
      window.postMessage(packet, '*');
    } catch (e) {
      console.error('[Rugsense/inpage] postMessage error:', e);
    }

    // Kanal 2: DOM CustomEvent (iframe sandbox yedeği)
    try {
      document.dispatchEvent(
        new CustomEvent('RugsenseInpageEvent', { detail: packet })
      );
    } catch (e) {
      console.error('[Rugsense/inpage] CustomEvent error:', e);
    }
  }

  // Bir provider'ı güvenli şekilde hook'la
  function hookProvider(provider: any, label = 'unknown') {
    if (!provider || typeof provider.request !== 'function') {
      console.log(`[Rugsense/inpage] Skipping ${label}: not a valid provider`);
      return;
    }

    // Aynı provider daha önce hook'landıysa ve signature değişmediyse tekrar etme
    const sig = provider.request.toString();
    if (HOOKED.has(provider) && LAST_SIG.get(provider) === sig) {
      // console.log(`[Rugsense/inpage] Provider ${label} already hooked`); // Spam log'u kaldırıldı
      return;
    }

    console.log(`[Rugsense/inpage] Hooking provider: ${label}`, provider);

    // Orijinali sakla
    const orig = provider.request.bind(provider);
    ORIGINALS.set(provider, orig);

    const proxy = new Proxy(orig, {
      apply: async (target, thisArg, argArray: any[]) => {
        const args = argArray?.[0] || {};
        try {
          // 1) İşlem gönderimi
          if (
            args?.method === 'eth_sendTransaction' &&
            Array.isArray(args.params) &&
            args.params[0]
          ) {
            const tx = args.params[0] || {};
            const to: string | undefined = tx.to;
            const from: string | undefined = tx.from;
            const data: string | undefined = tx.data
              ? String(tx.data)
              : undefined;
            const selector = data ? data.slice(0, 10) : undefined;
            const value = tx.value;
            const gas = tx.gas;

            console.log(
              '[Rugsense/inpage] eth_sendTransaction detected via',
              label,
              {
                to,
                from,
                selector,
                hasData: !!data,
                value: value ? String(value) : undefined,
                gas: gas ? String(gas) : undefined,
              }
            );

            // Takip edilen adreslerle ilgili transaction kontrolü
            const fromLower = from?.toLowerCase();
            const toLower = to?.toLowerCase();
            const isTrackedFrom =
              fromLower && trackedAddresses.includes(fromLower);
            const isTrackedTo = toLower && trackedAddresses.includes(toLower);

            if (isTrackedFrom || isTrackedTo) {
              console.log(
                '[Rugsense/inpage] TRACKED ADDRESS TRANSACTION DETECTED!',
                {
                  from: fromLower,
                  to: toLower,
                  isTrackedFrom,
                  isTrackedTo,
                  trackedAddresses,
                }
              );

              // Extension'ı otomatik aç - dropdown'ı göster ve vurgula
              setTimeout(() => {
                const dropdown = document.getElementById('rugsense-dropdown');
                if (dropdown) {
                  dropdown.classList.add('rugsense-visible');
                  dropdown.style.display = 'block';

                  // Dropdown'ı vurgula - kırmızı border ve animasyon
                  dropdown.style.border = '3px solid #ef4444';
                  dropdown.style.animation = 'pulse 1s ease-in-out 3';
                  dropdown.style.zIndex = '999999999';

                  // Alert bölümünü göster
                  const alertSection = document.getElementById(
                    'rugsense-alert-section'
                  );
                  const alertDetails = document.getElementById(
                    'rugsense-alert-details'
                  );
                  if (alertSection && alertDetails) {
                    alertSection.style.display = 'block';
                    // Transaction type'ı method signature'a göre belirle
                    let alertTxType = 'Contract Call';
                    if (data) {
                      const methodSig = data.substring(0, 10);
                      if (methodSig === '0xa9059cbb')
                        alertTxType = 'Token Transfer';
                      else if (methodSig === '0x095ea7b3')
                        alertTxType = 'Token Approval';
                      else if (methodSig === '0xa22cb465')
                        alertTxType = 'Set Approval For All';
                      else if (methodSig === '0x40c10f19') alertTxType = 'Mint';
                      else if (methodSig === '0x42842e0e')
                        alertTxType = 'Safe Transfer From';
                      else if (methodSig === '0x23b872dd')
                        alertTxType = 'Transfer From';
                    } else if (!to) {
                      alertTxType = 'Contract Deployment';
                    } else if (!data) {
                      alertTxType = 'ETH Transfer';
                    }

                    // Method signature'dan daha detaylı bilgi çıkar
                    let methodDetails = '';
                    if (data) {
                      const methodSig = data.substring(0, 10);
                      if (methodSig === '0xa9059cbb') {
                        methodDetails = 'transfer(address,uint256)';
                      } else if (methodSig === '0x095ea7b3') {
                        methodDetails = 'approve(address,uint256)';
                      } else if (methodSig === '0xa22cb465') {
                        methodDetails = 'setApprovalForAll(address,bool)';
                      } else if (methodSig === '0x40c10f19') {
                        methodDetails = 'mint(address,uint256)';
                      } else if (methodSig === '0x42842e0e') {
                        methodDetails =
                          'safeTransferFrom(address,address,uint256)';
                      } else if (methodSig === '0x23b872dd') {
                        methodDetails = 'transferFrom(address,address,uint256)';
                      } else {
                        methodDetails = `Unknown method (${methodSig})`;
                      }
                    }

                    // Contract verification bilgilerini al
                    let verificationInfo = '';
                    if (to && data) {
                      checkContractVerification(to).then(
                        (verificationResult) => {
                          const contractStatus = verificationResult.isVerified
                            ? `✅ Verified (${
                                verificationResult.contractName || 'Unknown'
                              })`
                            : `❌ UNVERIFIED - Source code not available`;

                          const networkInfo = verificationResult.network
                            ? ` | Network: ${verificationResult.network}`
                            : '';

                          // Security analysis yap (sadece tracked address transaction'larında)
                          if (
                            verificationResult.isVerified &&
                            verificationResult.sourceCode &&
                            (isTrackedFrom || isTrackedTo)
                          ) {
                            console.log(
                              `[Rugsense/inpage] Running AI analysis for tracked address transaction`
                            );
                            analyzeContractSecurity(
                              to,
                              verificationResult.sourceCode
                            ).then((securityResult) => {
                              const riskColor =
                                securityResult.riskLevel === 'CRITICAL'
                                  ? '#ef4444'
                                  : securityResult.riskLevel === 'HIGH'
                                  ? '#f97316'
                                  : securityResult.riskLevel === 'MEDIUM'
                                  ? '#eab308'
                                  : '#22c55e';

                              // Alert detaylarını güncelle (security analysis ile)
                              const alertDetailsEl = document.getElementById(
                                'rugsense-alert-details'
                              );
                              if (alertDetailsEl) {
                                alertDetailsEl.innerHTML = `
                                <div style="margin-bottom: 8px;"><strong>Direction:</strong> ${
                                  isTrackedFrom ? 'FROM' : 'TO'
                                } tracked address</div>
                                <div style="margin-bottom: 8px;"><strong>Tracked Address:</strong> ${
                                  fromLower || toLower
                                }</div>
                                <div style="margin-bottom: 8px;"><strong>Contract Address:</strong> ${
                                  to || 'N/A'
                                }</div>
                                <div style="margin-bottom: 8px;"><strong>Transaction Type:</strong> ${alertTxType}</div>
                                ${
                                  methodDetails
                                    ? `<div style="margin-bottom: 8px;"><strong>Method:</strong> ${methodDetails}</div>`
                                    : ''
                                }
                                <div style="margin-bottom: 8px;"><strong>Contract Status:</strong> ${contractStatus}${networkInfo}</div>
                                <div style="margin-bottom: 8px;"><strong>Security Risk:</strong> <span style="color: ${riskColor}; font-weight: bold;">${
                                  securityResult.riskLevel
                                }</span></div>
                                <div style="margin-bottom: 8px;"><strong>Time:</strong> ${new Date().toLocaleTimeString()}</div>
                                <div style="margin-top: 10px; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 6px; font-size: 12px;">
                                  <strong>Warning:</strong> This transaction involves a tracked address. Please review carefully before proceeding.
                                  ${
                                    !verificationResult.isVerified
                                      ? '<br><strong>UNVERIFIED CONTRACT:</strong> Source code not available - proceed with extreme caution!'
                                      : ''
                                  }
                                  ${
                                    securityResult.riskLevel === 'CRITICAL' ||
                                    securityResult.riskLevel === 'HIGH'
                                      ? `<br><strong>HIGH RISK CONTRACT:</strong> ${securityResult.summary}`
                                      : ''
                                  }
                                </div>
                                <div style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 6px; font-size: 11px;">
                                  <strong>Security Issues:</strong><br>
                                  ${securityResult.issues
                                    .slice(0, 3)
                                    .map((issue) => `• ${issue}`)
                                    .join('<br>')}
                                  ${
                                    securityResult.issues.length > 3
                                      ? `<br>• ... and ${
                                          securityResult.issues.length - 3
                                        } more`
                                      : ''
                                  }
                                </div>
                              `;
                              }
                            });
                          } else {
                            // Source code yoksa normal alert
                            const alertDetailsEl = document.getElementById(
                              'rugsense-alert-details'
                            );
                            if (alertDetailsEl) {
                              alertDetailsEl.innerHTML = `
                              <div style="margin-bottom: 8px;"><strong>Direction:</strong> ${
                                isTrackedFrom ? 'FROM' : 'TO'
                              } tracked address</div>
                              <div style="margin-bottom: 8px;"><strong>Tracked Address:</strong> ${
                                fromLower || toLower
                              }</div>
                              <div style="margin-bottom: 8px;"><strong>Contract Address:</strong> ${
                                to || 'N/A'
                              }</div>
                              <div style="margin-bottom: 8px;"><strong>Transaction Type:</strong> ${alertTxType}</div>
                              ${
                                methodDetails
                                  ? `<div style="margin-bottom: 8px;"><strong>Method:</strong> ${methodDetails}</div>`
                                  : ''
                              }
                              <div style="margin-bottom: 8px;"><strong>Contract Status:</strong> ${contractStatus}${networkInfo}</div>
                              <div style="margin-bottom: 8px;"><strong> Time:</strong> ${new Date().toLocaleTimeString()}</div>
                              <div style="margin-top: 10px; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 6px; font-size: 12px;">
                                <strong>Warning:</strong> This transaction involves a tracked address. Please review carefully before proceeding.
                                ${
                                  !verificationResult.isVerified
                                    ? '<br><strong>UNVERIFIED CONTRACT:</strong> Source code not available - proceed with extreme caution!'
                                    : ''
                                }
                              </div>
                            `;
                            }
                          }
                        }
                      );
                    }

                    alertDetails.innerHTML = `
                      <div style="margin-bottom: 8px;"><strong>Direction:</strong> ${
                        isTrackedFrom ? 'FROM' : 'TO'
                      } tracked address</div>
                      <div style="margin-bottom: 8px;"><strong>Tracked Address:</strong> ${
                        fromLower || toLower
                      }</div>
                      <div style="margin-bottom: 8px;"><strong>Contract Address:</strong> ${
                        to || 'N/A'
                      }</div>
                      <div style="margin-bottom: 8px;"><strong>Transaction Type:</strong> ${alertTxType}</div>
                      ${
                        methodDetails
                          ? `<div style="margin-bottom: 8px;"><strong>Method:</strong> ${methodDetails}</div>`
                          : ''
                      }
                      <div style="margin-bottom: 8px;"><strong>Contract Status:</strong> Checking verification...</div>
                      <div style="margin-bottom: 8px;"><strong>Time:</strong> ${new Date().toLocaleTimeString()}</div>
                      <div style="margin-top: 10px; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 6px; font-size: 12px;">
                        <strong>Warning:</strong> This transaction involves a tracked address. Please review carefully before proceeding.
                      </div>
                    `;
                  }

                  setTimeout(() => {
                    dropdown.style.border = '2px solid #9cd2ec';
                    dropdown.style.animation = '';
                  }, 3000);

                  console.log(
                    '[Rugsense/inpage] Auto-opened dropdown for tracked address transaction'
                  );
                }
              }, 100);

              post('Rugsense/ApproveDetected', {
                title: 'TRACKED ADDRESS TRANSACTION',
                body: `${isTrackedFrom ? 'FROM' : 'TO'} tracked address: ${
                  fromLower || toLower
                }`,
              });
            }

            const txHash = `${from}-${to}-${data}-${Date.now()}`;

            if (!to && data) {
              const tx = {
                id: txHash,
                type: 'Contract Deployment',
                address: from || 'Unknown',
                timestamp: Date.now(),
                details: {
                  bytecodeLength: data.length,
                  gas: args?.params?.[0]?.gas,
                },
              };
              addRecentTransaction(tx);
            } else if (to && !data) {
              const tx = {
                id: txHash,
                type: 'ETH Transfer',
                address: to,
                timestamp: Date.now(),
                details: {
                  value: args?.params?.[0]?.value,
                },
              };
              addRecentTransaction(tx);
            } else if (to && data) {
              const methodSig = data.substring(0, 10);
              let txType = 'Contract Call';

              console.log('[Rugsense/inpage] Contract call detected:', {
                to: to,
                data: data,
                methodSig: methodSig,
                from: from,
              });

              if (methodSig === '0xa9059cbb') {
                txType = 'Token Transfer';
                console.log('[Rugsense/inpage] Token Transfer detected');
              } else if (methodSig === '0x095ea7b3') {
                txType = 'Token Approval';
                console.log('[Rugsense/inpage] Token Approval detected');
              } else if (methodSig === '0xa22cb465') {
                txType = 'Set Approval For All';
                console.log('[Rugsense/inpage] Set Approval For All detected');
              } else if (methodSig === '0x40c10f19') {
                txType = 'Mint';
                console.log('[Rugsense/inpage] Mint detected');
              } else if (methodSig === '0x42842e0e') {
                txType = 'Safe Transfer From';
                console.log('[Rugsense/inpage] Safe Transfer From detected');
              } else if (methodSig === '0x23b872dd') {
                txType = 'Transfer From';
                console.log('[Rugsense/inpage] Transfer From detected');
              } else {
                console.log(
                  '[Rugsense/inpage] Unknown method signature:',
                  methodSig
                );
              }

              checkContractVerification(to).then((verificationResult) => {
                console.log(
                  `[Rugsense/Aptos] DEBUG - Verification result:`,
                  verificationResult
                );
                console.log(
                  `[Rugsense/Aptos] DEBUG - isTrackedFrom:`,
                  isTrackedFrom
                );
                console.log(
                  `[Rugsense/Aptos] DEBUG - isTrackedTo:`,
                  isTrackedTo
                );
                console.log(
                  `[Rugsense/Aptos] DEBUG - isVerified:`,
                  verificationResult.isVerified
                );
                console.log(
                  `[Rugsense/Aptos] DEBUG - hasSourceCode:`,
                  !!verificationResult.sourceCode
                );

                console.log(
                  `[Rugsense/Aptos] DEBUG - About to check analysis condition: isTrackedFrom=${isTrackedFrom}, isTrackedTo=${isTrackedTo}`
                );

                if (isTrackedFrom || isTrackedTo) {
                  console.log(
                    `[Rugsense/Aptos] DEBUG - Analysis condition met, starting analysis...`
                  );

                  if (
                    verificationResult.isVerified &&
                    verificationResult.sourceCode
                  ) {
                    console.log(
                      `[Rugsense/inpage] Running full analysis for verified contract in tracked address transaction`
                    );
                  } else {
                    console.log(
                      `[Rugsense/inpage] Running basic analysis for unverified contract in tracked address transaction`
                    );
                  }

                  console.log(
                    `[Rugsense/Aptos] DEBUG - Calling analyzeContractSecurity for: ${to}`
                  );
                  analyzeContractSecurity(
                    to,
                    verificationResult.sourceCode
                  ).then((securityResult) => {
                    console.log(
                      `[Rugsense/Aptos] DEBUG - Analysis completed, result:`,
                      securityResult
                    );
                    const tx = {
                      id: txHash,
                      type: txType,
                      address: to,
                      timestamp: Date.now(),
                      details: {
                        method: methodSig,
                        verified: verificationResult.isVerified,
                        contractName: verificationResult.contractName,
                        compilerVersion: verificationResult.compilerVersion,
                        network: verificationResult.network,
                        securityRisk: securityResult.riskLevel,
                        securityIssues: securityResult.issues,
                        from: from,
                      },
                    };
                    addRecentTransaction(tx);
                  });
                } else {
                  const tx = {
                    id: txHash,
                    type: txType,
                    address: to,
                    timestamp: Date.now(),
                    details: {
                      method: methodSig,
                      verified: verificationResult.isVerified,
                      contractName: verificationResult.contractName,
                      compilerVersion: verificationResult.compilerVersion,
                      network: verificationResult.network,
                      from: from,
                    },
                  };
                  addRecentTransaction(tx);
                }
              });
            } else {
              console.log(
                `[Rugsense/Aptos] DEBUG - Analysis condition NOT met: isTrackedFrom=${isTrackedFrom}, isTrackedTo=${isTrackedTo}`
              );
            }

            return await target.apply(thisArg, argArray);
          }
          function post(type: string, payload: any) {
            const packet = {
              target: 'RugsenseInpage',
              type,
              payload,
              address: payload?.address,
            };
            console.log('[Rugsense/inpage] post:', type, payload);
            window.postMessage(packet, '*');
            try {
              document.dispatchEvent(
                new CustomEvent('RugsenseInpageEvent', { detail: packet })
              );
            } catch {}
          }

          function short(a?: string) {
            return a ? a.slice(0, 6) + '…' + a.slice(-4) : 'unknown';
          }

          if (args?.method === 'eth_requestAccounts') {
            console.log('[Rugsense/inpage] eth_requestAccounts via', label);
            const res = await target.apply(thisArg, argArray);
            const addr = Array.isArray(res) ? res[0] : undefined;
            if (addr) post('Rugsense/TrackAddress', { address: addr });
            return res;
          }

          if (args?.method === 'eth_sendRawTransaction') {
            console.log('[Rugsense/inpage] eth_sendRawTransaction via', label);
            post('Rugsense/ApproveDetected', {
              title: 'Raw Transaction',
              body: 'Raw transaction being sent - review carefully',
            });
            return await target.apply(thisArg, argArray);
          }

          if (args?.method === 'eth_signTransaction') {
            console.log('[Rugsense/inpage] eth_signTransaction via', label);
            post('Rugsense/ApproveDetected', {
              title: 'Transaction Signing',
              body: 'Transaction is being signed - review details',
            });
            return await target.apply(thisArg, argArray);
          }

          if (
            (args?.method || '').startsWith('eth_signTypedData') ||
            args?.method === 'personal_sign'
          ) {
            console.log(
              '[Rugsense/inpage] signature method:',
              args.method,
              'via',
              label
            );
            post('Rugsense/ApproveDetected', {
              title: 'Signature Request',
              body: 'Review the message before signing',
            });
            return await target.apply(thisArg, argArray);
          }

          return await target.apply(thisArg, argArray);
        } catch (e) {
          console.error('[Rugsense/inpage] error', e);
          throw e;
        }
      },
    });

    try {
      Object.defineProperty(provider, 'request', { value: proxy });
      console.log(
        '[Rugsense/inpage] provider.request proxied (defineProperty) —',
        label
      );
    } catch {
      provider.request = proxy;
      console.log(
        '[Rugsense/inpage] provider.request proxied (assign) —',
        label
      );
    }

    HOOKED.add(provider);
    LAST_SIG.set(provider, proxy.toString());
  }

  function scanAndHookAll() {
    const w = window as any;

    if (w.ethereum) {
      hookProvider(w.ethereum, 'window.ethereum');
      if (Array.isArray(w.ethereum.providers)) {
        for (const p of w.ethereum.providers) {
          hookProvider(p, 'ethereum.providers[]');
        }
      }
    }

    if (w.remix) {
      console.log('[Rugsense/inpage] Remix detected, scanning for providers');
      const remixProviders = [
        w.remix.ethereum,
        w.remix.provider,
        w.remix.web3?.currentProvider,
        w.remix.web3?.eth?.currentProvider,
      ].filter(Boolean);

      remixProviders.forEach((provider, i) => {
        hookProvider(provider, `remix.provider[${i}]`);
      });
    }

    if (
      location.hostname.includes('remix.ethereum.org') ||
      location.hostname.includes('remix-project.org')
    ) {
      console.log(
        '[Rugsense/inpage] Remix IDE detected, setting up specific hooks'
      );

      const remixElements = [
        'remix-app',
        'remix-ide',
        'remix-ui',
        'tx-runner',
        'tx-execution',
      ];

      remixElements.forEach((selector) => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((element, i) => {
          console.log(
            `[Rugsense/inpage] Found Remix element: ${selector}[${i}]`
          );

          element.addEventListener('click', (e) => {
            console.log(
              `[Rugsense/inpage] Remix element clicked: ${selector}`,
              e.target
            );
            post('Rugsense/ApproveDetected', {
              title: 'Remix Transaction',
              body: `Transaction triggered via ${selector}`,
            });
          });
        });
      });
    }

    if (w.web3?.currentProvider) {
      hookProvider(w.web3.currentProvider, 'web3.currentProvider');
    }

    const commonProviders = [
      'ethereum',
      'web3',
      'provider',
      'wallet',
      'metamask',
    ];

    commonProviders.forEach((name) => {
      if (w[name] && typeof w[name].request === 'function') {
        hookProvider(w[name], `window.${name}`);
      }
    });
  }

  scanAndHookAll();

  getTrackedAddresses();

  function createDropdownUI() {
    const existingDropdown = document.getElementById('rugsense-dropdown');
    if (existingDropdown) {
      existingDropdown.remove();
    }

    const dropdown = document.createElement('div');
    dropdown.id = 'rugsense-dropdown';
    dropdown.classList.add('rugsense-dropdown-wrapper');
    dropdown.innerHTML = `
      <div style="padding: 20px; color: white; font-family: Arial, sans-serif;">
        <div class="logo-wrapper">
          <img src="${getExtensionURL('icons/logo.png')}" 
                 style="height: 64px; object-fit: contain;" 
                 alt="Rugsense Logo" />
                 <span class="logo-text">RUGSENSE</span>
        </div>
        
        <div id="rugsense-alert-section" style="display: none; background: linear-gradient(135deg, #dc2626, #b91c1c); color: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 3px solid #ef4444; position: relative; box-shadow: 0 4px 20px rgba(220, 38, 38, 0.3);">
          <div style="font-weight: bold; font-size: 18px; margin-bottom: 15px; text-align: center; text-shadow: 0 2px 4px rgba(0,0,0,0.3);"> TRACKED ADDRESS ALERT</div>
          <div id="rugsense-alert-details" style="font-size: 14px; line-height: 1.6; background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);"></div>
          <button id="rugsense-alert-close" style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.3); color: white; font-size: 18px; cursor: pointer; padding: 5px 10px; border-radius: 6px; width: auto; height: auto;">×</button>
        </div>
        
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
          <button id="rugsense-manage-addresses" 
                  style="flex: 1; padding: 10px; background: #3b82f6; color: white; 
                         border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
            Manage Addresses
          </button>
          <button id="rugsense-recent-transactions-btn" 
                  style="flex: 1; padding: 10px; background: #10b981; color: white; 
                         border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
            Recent Transactions
          </button>
        </div>
        
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
          <button id="rugsense-blockchain-cache" 
                  style="flex: 1; padding: 10px; background: #8b5cf6; color: white; 
                         border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
            Blockchain Cache
          </button>
          <button id="rugsense-aptos-wallet" 
                  style="flex: 1; padding: 10px; background: ${
                    connectedWalletAddress ? '#10b981' : '#f59e0b'
                  }; color: white; 
                         border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
            ${connectedWalletAddress ? ' Wallet Connected' : ' Connect Aptos'}
          </button>
          <button id="rugsense-clear-wallet" 
                  style="flex: 1; padding: 10px; background: #dc3545; color: white; 
                         border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
             Clear Wallet
          </button>
        </div>
        
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
          <button id="rugsense-settings" 
                  style="flex: 1; padding: 10px; background: #6b7280; color: white; 
                         border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
             Settings
          </button>
          <button id="rugsense-close-dropdown" 
                  style="flex: 1; padding: 10px; background: #ef4444; color: white; 
                         border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
             Close
          </button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .rugsense-dropdown-wrapper {
        position: fixed !important;
        top: 35px !important;
        left: 20px !important;
        width: 380px !important;
        min-height: 250px !important;
        background: #1a1a1a !important;
        border: 4px solid #9cd2ec !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 32px rgba(0,0,0,0.75) !important;
        z-index: 2147483647 !important;
        z-index: 999999999 !important;
        font-family: Arial, sans-serif !important;
        color: white !important;
        display: none !important;
      }
      
      .rugsense-dropdown-wrapper.rugsense-visible {
        display: block !important;
      }
      
      .rugsense-dropdown-container {
        padding: 0;
      }
      
      .rugsense-dropdown-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid #333;
        background: #2a2a2a;
        border-radius: 12px 12px 0 0;
      }
      
      .rugsense-logo {
        font-weight: bold;
        font-size: 16px;
      }
      
      .rugsense-status {
        font-size: 12px;
        color: #9cd2ec;
        background: rgba(74, 222, 128, 0.1);
        padding: 4px 8px;
        border-radius: 6px;
      }
      
      .rugsense-dropdown-content {
        padding: 12px;
        max-height: 300px;
        overflow-y: auto;
      }
      
      .rugsense-section {
        margin-bottom: 12px;
      }
      
      .rugsense-section:last-child {
        margin-bottom: 0;
      }
      
      .rugsense-section-title {
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 12px;
        color: #e5e5e5;
      }
      
      .rugsense-address-list {
        margin-bottom: 12px;
      }
      
      .rugsense-address-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: #2a2a2a;
        border-radius: 6px;
        margin-bottom: 6px;
        font-size: 12px;
      }
      
      .rugsense-address-text {
        font-family: monospace;
        color: #e5e5e5;
      }
      
      .rugsense-remove-btn {
        background: #ef4444;
        color: white;
        border: none;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 10px;
        cursor: pointer;
      }
      
      .rugsense-remove-btn:hover {
        background: #dc2626;
      }
      
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.02); }
        100% { transform: scale(1); }
      }
      
      .rugsense-add-address {
        display: flex;
        gap: 8px;
      }
      
      #rugsense-address-input {
        flex: 1;
        padding: 8px 12px;
        background: #2a2a2a;
        border: 1px solid #444;
        border-radius: 6px;
        color: white;
        font-size: 12px;
      }
      
      #rugsense-address-input:focus {
        outline: none;
        border-color: #9cd2ec;
      }
      
      #rugsense-add-btn {
        padding: 8px 16px;
        background: #9cd2ec;
        color: #1a1a1a;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      
      #rugsense-add-btn:hover {
        background: #22c55e;
      }
      
      .rugsense-alert-item {
        padding: 12px;
        background: #2a2a2a;
        border-radius: 6px;
        margin-bottom: 8px;
        border-left: 3px solid #9cd2ec;
      }
      
      .rugsense-alert-title {
        font-weight: 600;
        font-size: 13px;
        margin-bottom: 4px;
      }
      
      .rugsense-alert-body {
        font-size: 11px;
        color: #a3a3a3;
        line-height: 1.4;
      }
      
      .rugsense-no-addresses,
      .rugsense-no-alerts {
        text-align: center;
        color: #666;
        font-size: 12px;
        padding: 20px;
      }

      .logo-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        font-size: 18px;
        font-weight: bold;
        margin-bottom: 15px;
        color: #9cd2ec;
      }

      .logo-text {
        font-family: 'Play', 'Arial', sans-serif;
        font-size: 24px;
        font-weight: bold;
        color: #9cd2ec;
      }
       
      .play-bold {
        font-family: 'Play', 'Arial', sans-serif;
        font-weight: bold;
        font-size: 18px;
        color: #9cd2ec;
      }
    `;

    // Güvenli DOM ekleme
    if (document.head) {
      document.head.appendChild(style);
    } else {
      console.warn('[Rugsense/inpage] document.head not available');
    }

    if (document.body) {
      document.body.appendChild(dropdown);
    } else {
      console.warn('[Rugsense/inpage] document.body not available');
    }

    // Başlangıçta gizli yap - hemen
    dropdown.style.display = 'none';

    // Event listener'ları ekle
    setupDropdownEvents();

    // İlk yükleme - storage'dan adresleri al
    getTrackedAddresses();

    // Recent transactions'ı güncelle
    updateRecentTransactions();

    console.log('[Rugsense/inpage] Dropdown created and ready!');
  }

  // Tracked addresses'i güncelle
  function updateTrackedAddresses() {
    const container = document.getElementById('rugsense-tracked-addresses');
    if (container) {
      if (trackedAddresses.length === 0) {
        container.innerHTML =
          '<div style="color: #9ca3af;">No addresses tracked yet</div>';
      } else {
        container.innerHTML = trackedAddresses
          .map(
            (addr) => `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; padding: 5px; background: #1f2937; border-radius: 4px;">
            <span style="font-family: monospace; font-size: 11px;">${addr}</span>
            <button onclick="removeAddress('${addr}')" style="background: #dc2626; color: white; border: none; border-radius: 3px; padding: 2px 6px; font-size: 10px; cursor: pointer;">Remove</button>
          </div>
        `
          )
          .join('');
      }
    }
  }

  // Dropdown event'leri
  function setupDropdownEvents() {
    // Alert kapatma butonu
    const alertCloseBtn = document.getElementById('rugsense-alert-close');
    if (alertCloseBtn) {
      alertCloseBtn.addEventListener('click', () => {
        const alertSection = document.getElementById('rugsense-alert-section');
        if (alertSection) {
          alertSection.style.display = 'none';
        }
      });
    }

    // Manage Addresses butonu
    const manageBtn = document.getElementById('rugsense-manage-addresses');
    if (manageBtn) {
      manageBtn.addEventListener('click', () => {
        showAddressManagement();
      });
    }

    // Recent Transactions butonu
    const recentBtn = document.getElementById(
      'rugsense-recent-transactions-btn'
    );
    if (recentBtn) {
      recentBtn.addEventListener('click', () => {
        showRecentTransactions();
      });
    }

    // Close dropdown butonu
    const closeBtn = document.getElementById('rugsense-close-dropdown');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        const dropdown = document.getElementById('rugsense-dropdown');
        if (dropdown) {
          dropdown.classList.remove('rugsense-visible');
          dropdown.style.display = 'none';
        }
      });
    }

    // Settings butonu
    const settingsBtn = document.getElementById('rugsense-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        showSettings();
      });
    }

    // Blockchain Cache butonu
    const blockchainBtn = document.getElementById('rugsense-blockchain-cache');
    if (blockchainBtn) {
      blockchainBtn.addEventListener('click', () => {
        showBlockchainCache();
      });
    }

    // Aptos Wallet butonu
    const aptosBtn = document.getElementById('rugsense-aptos-wallet');
    if (aptosBtn) {
      aptosBtn.addEventListener('click', () => {
        connectAptosWallet();
      });
    }

    // Clear Wallet butonu
    const clearBtn = document.getElementById('rugsense-clear-wallet');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        clearWalletAddress();
        showWalletNotFound();
        console.log('[Rugsense/Aptos] Wallet cleared');
      });
    }
  }

  function showBlockchainCache() {
    const existing = document.getElementById('rugsense-blockchain-cache-page');
    if (existing) {
      existing.remove();
    }

    const cachePage = document.createElement('div');
    cachePage.id = 'rugsense-blockchain-cache-page';
    cachePage.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
      background: rgba(0,0,0,0.9); z-index: 2147483648; 
      display: flex; align-items: center; justify-content: center;
      font-family: Arial, sans-serif;
    `;

    cachePage.innerHTML = `
      <div style="background: #1f2937; color: white; padding: 30px; border-radius: 12px; 
                  max-width: 600px; width: 90%; max-height: 80%; overflow-y: auto;
                  border: 2px solid #8b5cf6;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0; color: #8b5cf6;">Blockchain Cache</h2>
          <button id="rugsense-cache-close" style="background: #ef4444; color: white; border: none; 
                    padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 16px;">×</button>
        </div>
        
        <div style="background: #374151; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="color: #8b5cf6; margin-top: 0;">🦎 Aptos Contract</h3>
          <p style="margin: 10px 0; font-size: 14px; color: #d1d5db;">
            <strong>Address:</strong> <code style="background: #1f2937; padding: 2px 6px; border-radius: 4px;">${APTOS_CONTRACT_ADDRESS}</code>
          </p>
          <p style="margin: 10px 0; font-size: 14px; color: #d1d5db;">
            <strong>Network:</strong> <span style="color: #10b981;">${APTOS_NETWORK}</span>
          </p>
          <p style="margin: 10px 0; font-size: 14px; color: #d1d5db;">
            <strong>Reward:</strong> <span style="color: #f59e0b;">0.01 APT (testnet)</span>
          </p>
        </div>
        
        <div style="background: #374151; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="color: #8b5cf6; margin-top: 0;">Cache Status</h3>
          <p style="margin: 10px 0; font-size: 14px; color: #d1d5db;">
            <strong>Local Cache:</strong> <span style="color: #10b981;">${
              securityAnalysisCache.size
            } analyses</span>
          </p>
          <p style="margin: 10px 0; font-size: 14px; color: #d1d5db;">
            <strong>Blockchain Submissions:</strong> <span style="color: ${
              connectedWalletAddress ? '#10b981' : '#f59e0b'
            };">${
      connectedWalletAddress
        ? `Connected: ${connectedWalletAddress.slice(0, 8)}...`
        : 'Ready for wallet connection'
    }</span>
          </p>
        </div>
        
        <div style="background: #374151; padding: 20px; border-radius: 8px;">
          <h3 style="color: #8b5cf6; margin-top: 0;">How It Works</h3>
          <ol style="color: #d1d5db; font-size: 14px; line-height: 1.6;">
            <li>Track an address in the extension</li>
            <li>When a transaction is detected, analysis runs automatically</li>
            <li>Analysis results are submitted to Aptos blockchain</li>
            <li>First analyzer gets 0.01 APT testnet reward</li>
            <li>Results are cached on-chain for future reference</li>
          </ol>
        </div>
      </div>
    `;

    document.body.appendChild(cachePage);

    const closeBtn = document.getElementById('rugsense-cache-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        cachePage.remove();
      });
    }
  }

  async function connectAptosWallet() {
    console.log('[Rugsense/Aptos] Wallet connection requested');

    try {
      let aptosWallet = null;
      if (typeof window !== 'undefined') {
        if ((window as any).aptos) {
          aptosWallet = (window as any).aptos; // Petra
          console.log('[Rugsense/Aptos] Using Petra wallet');
        } else if ((window as any).martian) {
          aptosWallet = (window as any).martian; // Martian
          console.log('[Rugsense/Aptos] Using Martian wallet');
        } else if ((window as any).pontem) {
          aptosWallet = (window as any).pontem; // Pontem
          console.log('[Rugsense/Aptos] Using Pontem wallet');
        } else if ((window as any).fewcha) {
          aptosWallet = (window as any).fewcha; // Fewcha
          console.log('[Rugsense/Aptos] Using Fewcha wallet');
        } else if ((window as any).rise) {
          aptosWallet = (window as any).rise; // Rise
          console.log('[Rugsense/Aptos] Using Rise wallet');
        }
      }

      if (aptosWallet) {
        // Wallet'a bağlan
        const response = await aptosWallet.connect();
        console.log('[Rugsense/Aptos] Wallet connected:', response);

        const account = await aptosWallet.account();
        console.log('[Rugsense/Aptos] Account:', account);

        saveWalletAddress(account.address);

        clearWalletAddress();
        saveWalletAddress(account.address);

        showWalletConnected(account.address);
      } else {
        showWalletNotFound();
      }
    } catch (error) {
      console.error('[Rugsense/Aptos] Wallet connection error:', error);
      showWalletError(error);
    }
  }

  function showWalletConnected(address: string) {
    const walletPage = document.createElement('div');
    walletPage.id = 'rugsense-wallet-connected';
    walletPage.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
      background: rgba(0,0,0,0.9); z-index: 2147483648; 
      display: flex; align-items: center; justify-content: center;
      font-family: Arial, sans-serif;
    `;

    walletPage.innerHTML = `
      <div style="background: #1f2937; color: white; padding: 30px; border-radius: 12px; 
                  max-width: 500px; width: 90%; text-align: center;
                  border: 2px solid #10b981;">
        <h2 style="margin: 0 0 20px 0; color: #10b981;">🦎 Aptos Wallet Connected!</h2>
        <p style="margin: 10px 0; font-size: 14px; color: #d1d5db;">
          <strong>Address:</strong> <code style="background: #374151; padding: 4px 8px; border-radius: 4px;">${address}</code>
        </p>
        <p style="margin: 20px 0; font-size: 14px; color: #d1d5db;">
          Now you can submit analysis results to blockchain and earn 0.01 APT rewards!
        </p>
        <button id="rugsense-wallet-close" style="background: #10b981; color: white; border: none; 
                  padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 16px; margin-top: 20px;">
          Continue
        </button>
      </div>
    `;

    document.body.appendChild(walletPage);

    const closeBtn = document.getElementById('rugsense-wallet-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        walletPage.remove();
      });
    }
  }

  function showWalletNotFound() {
    alert(
      `🦎 Aptos Wallet Not Found\n\nPlease install an Aptos wallet:\n• Petra Wallet (Chrome Extension)\n• Martian Wallet\n• Pontem Wallet\n\nThen refresh the page and try again.`
    );
  }

  function showWalletError(error: any) {
    alert(
      `🦎 Aptos Wallet Error\n\nError: ${
        error.message || error
      }\n\nPlease try again or check your wallet connection.`
    );
  }

  function showAddressManagement() {
    const existing = document.getElementById('rugsense-address-management');
    if (existing) {
      existing.remove();
    }

    const managementPage = document.createElement('div');
    managementPage.id = 'rugsense-address-management';
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
      <div style="background: #1a1a1a; border: 2px solid #9cd2ec; border-radius: 12px; padding: 20px; width: 500px; max-height: 80vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="color: #9cd2ec; margin: 0;">Manage Tracked Addresses</h2>
          <button id="rugsense-close-management" style="background: #ef4444; color: white; border: none; border-radius: 6px; padding: 8px 12px; cursor: pointer;">Close</button>
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="color: #e5e7eb; display: block; margin-bottom: 5px;">Add New Address:</label>
          <div style="display: flex; gap: 10px;">
            <input type="text" id="rugsense-new-address" placeholder="0x..." 
                   style="flex: 1; padding: 10px; border: 1px solid #374151; border-radius: 6px; 
                          background: #1f2937; color: white;" />
            <button id="rugsense-add-new" 
                    style="padding: 10px 20px; background: #9cd2ec; color: black; 
                           border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
              Add
            </button>
          </div>
        </div>
        
        <div style="color: #fbbf24; font-weight: bold; margin-bottom: 10px;">Tracked Addresses (${
          trackedAddresses.length
        }):</div>
        <div id="rugsense-management-list" 
             style="background: #111827; padding: 15px; border-radius: 6px; border: 1px solid #374151; 
                    max-height: 300px; overflow-y: auto;">
          ${
            trackedAddresses.length === 0
              ? '<div style="color: #9ca3af; text-align: center; padding: 20px;">No addresses tracked yet</div>'
              : trackedAddresses
                  .map(
                    (addr) => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #1f2937; border-radius: 6px; margin-bottom: 8px;">
                <span style="font-family: monospace; color: #e5e5e5; font-size: 12px;">${addr}</span>
                <button onclick="removeAddress('${addr}')" style="background: #ef4444; color: white; border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 12px;">Remove</button>
              </div>
            `
                  )
                  .join('')
          }
        </div>
      </div>
    `;

    document.body.appendChild(managementPage);

    const closeBtn = document.getElementById('rugsense-close-management');
    const addBtn = document.getElementById('rugsense-add-new');
    const addressInput = document.getElementById('rugsense-new-address');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        managementPage.remove();
      });
    }

    if (addBtn && addressInput) {
      addBtn.addEventListener('click', () => {
        const address = addressInput.value.trim();
        if (address && address.startsWith('0x') && address.length === 42) {
          window.postMessage(
            {
              target: 'RugsenseContent',
              type: 'Rugsense/AddAddress',
              address: address,
            },
            '*'
          );

          trackedAddresses.push(address.toLowerCase());
          addressInput.value = '';
          updateManagementList();
        }
      });

      addressInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          addBtn.click();
        }
      });
    }

    function updateManagementList() {
      const list = document.getElementById('rugsense-management-list');
      if (list) {
        list.innerHTML =
          trackedAddresses.length === 0
            ? '<div style="color: #9ca3af; text-align: center; padding: 20px;">No addresses tracked yet</div>'
            : trackedAddresses
                .map(
                  (addr) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #1f2937; border-radius: 6px; margin-bottom: 8px;">
              <span style="font-family: monospace; color: #e5e5e5; font-size: 12px;">${addr}</span>
              <button onclick="removeAddress('${addr}')" style="background: #ef4444; color: white; border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 12px;">Remove</button>
            </div>
          `
                )
                .join('');
      }
    }
  }

  function showRecentTransactions() {
    const existing = document.getElementById(
      'rugsense-recent-transactions-page'
    );
    if (existing) {
      existing.remove();
    }

    const transactionsPage = document.createElement('div');
    transactionsPage.id = 'rugsense-recent-transactions-page';
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
      <div style="background: #1a1a1a; border: 2px solid #9cd2ec; border-radius: 12px; padding: 20px; width: 800px; max-height: 80vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="color: #9cd2ec; margin: 0;">Recent Transactions (${
            recentTransactions.length
          })</h2>
          <button id="rugsense-close-transactions" style="background: #ef4444; color: white; border: none; border-radius: 6px; padding: 8px 12px; cursor: pointer;">Close</button>
        </div>
        
        <div id="rugsense-transactions-list" 
             style="background: #111827; padding: 15px; border-radius: 6px; border: 1px solid #374151; 
                    max-height: 500px; overflow-y: auto;">
          ${
            recentTransactions.length === 0
              ? '<div style="color: #9ca3af; text-align: center; padding: 40px;">No recent transactions</div>'
              : recentTransactions
                  .map((tx) => {
                    const timeAgo = Math.floor(
                      (Date.now() - tx.timestamp) / 1000
                    );
                    const timeStr =
                      timeAgo < 60
                        ? `${timeAgo}s ago`
                        : `${Math.floor(timeAgo / 60)}m ago`;

                    let details = '';
                    if (tx.type === 'Contract Deployment') {
                      details = `Bytecode: ${tx.details.bytecodeLength} bytes`;
                    } else if (tx.type === 'ETH Transfer') {
                      const value =
                        parseInt(tx.details.value || '0', 16) / 1e18;
                      details = `Value: ${value.toFixed(4)} ETH`;
                    } else if (tx.type === 'Mint') {
                      const contractName = tx.details.contractName
                        ? ` (${tx.details.contractName})`
                        : '';
                      const network = tx.details.network
                        ? ` | ${tx.details.network}`
                        : '';
                      const securityRisk = tx.details.securityRisk
                        ? ` | ${tx.details.securityRisk}`
                        : '';
                      details = `Mint to: ${short(tx.details.from)} | ${
                        tx.details.verified ? '✅ Verified' : '❌ UNVERIFIED'
                      }${contractName}${network}${securityRisk}`;
                    } else if (tx.type === 'Token Transfer') {
                      const contractName = tx.details.contractName
                        ? ` (${tx.details.contractName})`
                        : '';
                      const network = tx.details.network
                        ? ` | ${tx.details.network}`
                        : '';
                      const securityRisk = tx.details.securityRisk
                        ? ` | ${tx.details.securityRisk}`
                        : '';
                      details = `Transfer | ${
                        tx.details.verified ? '✅ Verified' : '❌ UNVERIFIED'
                      }${contractName}${network}${securityRisk}`;
                    } else if (tx.type === 'Token Approval') {
                      const contractName = tx.details.contractName
                        ? ` (${tx.details.contractName})`
                        : '';
                      const network = tx.details.network
                        ? ` | ${tx.details.network}`
                        : '';
                      const securityRisk = tx.details.securityRisk
                        ? ` | ${tx.details.securityRisk}`
                        : '';
                      details = `Approval | ${
                        tx.details.verified ? '✅ Verified' : '❌ UNVERIFIED'
                      }${contractName}${network}${securityRisk}`;
                    } else if (tx.type === 'Set Approval For All') {
                      const contractName = tx.details.contractName
                        ? ` (${tx.details.contractName})`
                        : '';
                      const network = tx.details.network
                        ? ` | ${tx.details.network}`
                        : '';
                      const securityRisk = tx.details.securityRisk
                        ? ` | ${tx.details.securityRisk}`
                        : '';
                      details = `Set Approval | ${
                        tx.details.verified ? '✅ Verified' : '❌ UNVERIFIED'
                      }${contractName}${network}${securityRisk}`;
                    } else {
                      const contractName = tx.details.contractName
                        ? ` (${tx.details.contractName})`
                        : '';
                      const network = tx.details.network
                        ? ` | ${tx.details.network}`
                        : '';
                      const securityRisk = tx.details.securityRisk
                        ? ` | ${tx.details.securityRisk}`
                        : '';
                      details = `Method: ${tx.details.method} | ${
                        tx.details.verified ? '✅ Verified' : '❌ UNVERIFIED'
                      }${contractName}${network}${securityRisk}`;
                    }

                    return `
                <div style="margin-bottom: 15px; padding: 15px; background: #1f2937; border-radius: 8px; border-left: 4px solid #9cd2ec;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-weight: bold; color: #9cd2ec; font-size: 14px;">${tx.type}</div>
                    <div style="color: #6b7280; font-size: 12px;">${timeStr}</div>
                  </div>
                  <div style="color: #d1d5db; font-size: 12px; margin-bottom: 5px; font-family: monospace;">${tx.address}</div>
                  <div style="color: #9ca3af; font-size: 11px;">${details}</div>
                </div>
              `;
                  })
                  .join('')
          }
        </div>
      </div>
    `;

    document.body.appendChild(transactionsPage);

    const closeBtn = document.getElementById('rugsense-close-transactions');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        transactionsPage.remove();
      });
    }
  }

  function showSettings() {
    alert('Settings page coming soon!');
  }

  function updateDropdownContent() {
    const addressList = document.getElementById('rugsense-address-list');
    if (addressList) {
      if (trackedAddresses.length === 0) {
        addressList.innerHTML =
          '<div class="rugsense-no-addresses">No addresses tracked</div>';
      } else {
        addressList.innerHTML = trackedAddresses
          .map(
            (addr) => `
          <div class="rugsense-address-item">
            <span class="rugsense-address-text">${addr}</span>
            <button class="rugsense-remove-btn" onclick="removeAddress('${addr}')">Remove</button>
          </div>
        `
          )
          .join('');
      }
    }
  }

  // Adres kaldırma fonksiyonu
  (window as any).removeAddress = (address: string) => {
    // Content script'e mesaj gönder
    window.postMessage(
      {
        target: 'RugsenseContent',
        type: 'Rugsense/RemoveAddress',
        address: address,
      },
      '*'
    );

    // Local state'i güncelle
    trackedAddresses = trackedAddresses.filter(
      (addr) => addr.toLowerCase() !== address.toLowerCase()
    );
    updateTrackedAddresses();
  };

  // Recent transaction ekleme fonksiyonu - duplicate önleme ile
  function addRecentTransaction(tx: any) {
    // Duplicate kontrolü - aynı ID'ye sahip transaction var mı?
    const isDuplicate = recentTransactions.some(
      (existing) => existing.id === tx.id
    );

    if (!isDuplicate) {
      recentTransactions.unshift(tx);
      // Son 10 transaction'ı tut
      if (recentTransactions.length > 10) {
        recentTransactions = recentTransactions.slice(0, 10);
      }
      updateRecentTransactions();
    } else {
      console.log('[Rugsense/inpage] Duplicate transaction prevented:', tx.id);
    }
  }

  // Recent transactions UI'ını güncelle
  function updateRecentTransactions() {
    const container = document.getElementById('rugsense-recent-transactions');
    if (container) {
      if (recentTransactions.length === 0) {
        container.innerHTML =
          '<div style="color: #9ca3af;">No recent transactions</div>';
      } else {
        container.innerHTML = recentTransactions
          .map((tx) => {
            const timeAgo = Math.floor((Date.now() - tx.timestamp) / 1000);
            const timeStr =
              timeAgo < 60
                ? `${timeAgo}s ago`
                : `${Math.floor(timeAgo / 60)}m ago`;

            let details = '';
            if (tx.type === 'Contract Deployment') {
              details = `Bytecode: ${tx.details.bytecodeLength} bytes`;
            } else if (tx.type === 'ETH Transfer') {
              const value = parseInt(tx.details.value || '0', 16) / 1e18;
              details = `Value: ${value.toFixed(4)} ETH`;
            } else if (tx.type === 'Mint') {
              details = `Mint to: ${short(tx.details.from)} | Verified: ${
                tx.details.verified ? '✅' : '❌'
              }`;
            } else if (tx.type === 'Token Transfer') {
              details = `Transfer | Verified: ${
                tx.details.verified ? '✅' : '❌'
              }`;
            } else if (tx.type === 'Token Approval') {
              details = `Approval | Verified: ${
                tx.details.verified ? '✅' : '❌'
              }`;
            } else if (tx.type === 'Set Approval For All') {
              details = `Set Approval | Verified: ${
                tx.details.verified ? '✅' : '❌'
              }`;
            } else {
              details = `Method: ${tx.details.method} | Verified: ${
                tx.details.verified ? '✅' : '❌'
              }`;
            }

            return `
            <div style="margin-bottom: 8px; padding: 6px; background: #1f2937; border-radius: 4px; border-left: 3px solid #9cd2ec;">
              <div style="font-weight: bold; color: #9cd2ec; font-size: 11px;">${
                tx.type
              }</div>
              <div style="color: #d1d5db; font-size: 10px; margin: 2px 0;">${short(
                tx.address
              )}</div>
              <div style="color: #9ca3af; font-size: 9px;">${details}</div>
              <div style="color: #6b7280; font-size: 9px; text-align: right;">${timeStr}</div>
            </div>
          `;
          })
          .join('');
      }
    }
  }

  function toggleDropdown() {
    const dropdown = document.getElementById('rugsense-dropdown');
    if (dropdown) {
      const isVisible = dropdown.classList.contains('rugsense-visible');
      if (isVisible) {
        dropdown.classList.remove('rugsense-visible');
        console.log('[Rugsense/inpage] Dropdown hidden');
      } else {
        dropdown.classList.add('rugsense-visible');
        console.log('[Rugsense/inpage] Dropdown shown');
      }
      console.log(`[Rugsense/inpage] Dropdown computed style:`, {
        display: window.getComputedStyle(dropdown).display,
        visibility: window.getComputedStyle(dropdown).visibility,
        opacity: window.getComputedStyle(dropdown).opacity,
        zIndex: window.getComputedStyle(dropdown).zIndex,
        position: window.getComputedStyle(dropdown).position,
        top: window.getComputedStyle(dropdown).top,
        right: window.getComputedStyle(dropdown).right,
        classes: dropdown.className,
      });
    } else {
      console.log('[Rugsense/inpage] Dropdown element not found!');
    }
  }

  (window as any).toggleRugsenseDropdown = toggleDropdown;

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (
      data &&
      data.target === 'RugsenseInpage' &&
      data.type === 'Rugsense/ToggleDropdown'
    ) {
      console.log('[Rugsense/inpage] Toggle dropdown message received');
      toggleDropdown();
    }
  });

  function setupGlobalHooks() {
    const w = window as any;

    if (w.ethereum) {
      console.log('[Rugsense/inpage] Setting up global ethereum hook');
      const originalEthereum = w.ethereum;

      w.ethereum = new Proxy(originalEthereum, {
        get(target, prop) {
          if (prop === 'request') {
            return new Proxy(target.request, {
              apply: async (fn, thisArg, args) => {
                console.log(
                  '[Rugsense/inpage] Global ethereum.request called:',
                  args
                );
                return await fn.apply(thisArg, args);
              },
            });
          }
          return target[prop];
        },
      });
    }

    if (w.web3) {
      console.log('[Rugsense/inpage] Setting up global web3 hook');
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
                      console.log(
                        '[Rugsense/inpage] Global web3.eth.sendTransaction called:',
                        args
                      );
                      post('Rugsense/ApproveDetected', {
                        title: 'Web3 Transaction',
                        body: 'Transaction via web3.eth.sendTransaction',
                      });
                      return await fn.apply(thisArg, args);
                    },
                  });
                }
                return ethTarget[ethProp];
              },
            });
          }
          return target[prop];
        },
      });
    }
  }

  setupGlobalHooks();

  function setupNetworkMonitoring() {
    console.log('[Rugsense/inpage] Setting up network monitoring');

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const [resource, config] = args;
      const url =
        typeof resource === 'string' ? resource : (resource as Request).url;

      if (
        url.includes('eth_') ||
        url.includes('rpc') ||
        url.includes('infura') ||
        url.includes('alchemy')
      ) {
        console.log(
          '[Rugsense/inpage] RPC request detected:',
          url,
          config?.body
        );

        if (config?.body && typeof config.body === 'string') {
          try {
            const body = JSON.parse(config.body);
            if (
              body.method === 'eth_sendTransaction' &&
              body.params &&
              body.params[0]
            ) {
              const tx = body.params[0];
              const from = tx.from?.toLowerCase();
              const to = tx.to?.toLowerCase();
              const isTrackedFrom = from && trackedAddresses.includes(from);
              const isTrackedTo = to && trackedAddresses.includes(to);

              console.log(
                '[Rugsense/inpage] eth_sendTransaction via fetch detected',
                {
                  from,
                  to,
                  isTrackedFrom,
                  isTrackedTo,
                }
              );

              if (isTrackedFrom || isTrackedTo) {
                post('Rugsense/ApproveDetected', {
                  title: 'TRACKED ADDRESS RPC TRANSACTION',
                  body: `${
                    isTrackedFrom ? 'FROM' : 'TO'
                  } tracked address via RPC: ${from || to}`,
                });
              } else if (to) {
                checkContractVerification(to).then((isVerified) => {
                  if (!isVerified) {
                    post('Rugsense/ApproveDetected', {
                      title: '⚠️ UNVERIFIED CONTRACT RPC',
                      body: `RPC call to UNVERIFIED contract!\nAddress: ${to}\n⚠️ Source code not available!`,
                    });
                  } else {
                    post('Rugsense/ApproveDetected', {
                      title: 'RPC Transaction',
                      body: `RPC call to verified contract\nAddress: ${to}`,
                    });
                  }
                });
              } else {
                post('Rugsense/ApproveDetected', {
                  title: 'RPC Transaction',
                  body: 'Transaction via RPC fetch request',
                });
              }
            }
          } catch (e) {}
        }
      }

      return await originalFetch(...args);
    };

    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      async: boolean = true,
      username?: string | null,
      password?: string | null
    ) {
      (this as any)._url = url.toString();
      return originalXHROpen.call(this, method, url, async, username, password);
    };

    XMLHttpRequest.prototype.send = function (
      data?: Document | XMLHttpRequestBodyInit | null
    ) {
      const url = (this as any)._url;
      if (
        url &&
        (url.includes('eth_') ||
          url.includes('rpc') ||
          url.includes('infura') ||
          url.includes('alchemy'))
      ) {
        console.log(
          '[Rugsense/inpage] RPC request via XHR detected:',
          url,
          data
        );

        if (data && typeof data === 'string') {
          try {
            const body = JSON.parse(data);
            if (
              body.method === 'eth_sendTransaction' &&
              body.params &&
              body.params[0]
            ) {
              const tx = body.params[0];
              const from = tx.from?.toLowerCase();
              const to = tx.to?.toLowerCase();
              const isTrackedFrom = from && trackedAddresses.includes(from);
              const isTrackedTo = to && trackedAddresses.includes(to);

              console.log(
                '[Rugsense/inpage] eth_sendTransaction via XHR detected',
                {
                  from,
                  to,
                  isTrackedFrom,
                  isTrackedTo,
                }
              );

              if (isTrackedFrom || isTrackedTo) {
                post('Rugsense/ApproveDetected', {
                  title: 'TRACKED ADDRESS RPC TRANSACTION',
                  body: `${
                    isTrackedFrom ? 'FROM' : 'TO'
                  } tracked address via XHR: ${from || to}`,
                });
              } else {
                post('Rugsense/ApproveDetected', {
                  title: 'RPC Transaction',
                  body: 'Transaction via RPC XHR request',
                });
              }
            }
          } catch (e) {}
        }
      }

      return originalXHRSend.call(this, data);
    };
  }

  setupNetworkMonitoring();

  document.addEventListener('click', (e) => {
    const target = e.target as Element;

    if (target.tagName === 'BUTTON') {
      const buttonText = target.textContent?.toLowerCase() || '';
      const buttonClass = target.className?.toLowerCase() || '';
      const buttonId = target.id?.toLowerCase() || '';

      if (
        buttonText.includes('transact') ||
        buttonText.includes('send') ||
        buttonText.includes('transfer') ||
        buttonText.includes('run') ||
        buttonText.includes('execute') ||
        buttonText.includes('deploy') ||
        buttonClass.includes('transact') ||
        buttonClass.includes('send') ||
        buttonClass.includes('transfer') ||
        buttonClass.includes('run') ||
        buttonClass.includes('execute') ||
        buttonClass.includes('deploy') ||
        buttonId.includes('transact') ||
        buttonId.includes('send') ||
        buttonId.includes('transfer') ||
        buttonId.includes('run') ||
        buttonId.includes('execute') ||
        buttonId.includes('deploy')
      ) {
        console.log('[Rugsense/inpage] Transaction button clicked:', {
          text: buttonText,
          class: buttonClass,
          id: buttonId,
        });

        post('Rugsense/ApproveDetected', {
          title: 'Transaction Button Clicked',
          body: `Button clicked: ${buttonText || buttonClass || buttonId}`,
        });
      }
    }
  });

  // Tüm click event'lerini yakala (debug için) - KAPALI spam yapıyor
  // document.addEventListener('click', (e) => {
  //   console.log("[Rugsense/inpage] DEBUG - Any click:", e.target);
  // }, true);

  // Test notification kaldırıldı - sürekli spam yapıyordu

  // Basit test - her 5 saniyede bir test bildirimi (KAPALI - sonsuz döngü yapıyor)
  // setInterval(() => {
  //   console.log("[Rugsense/inpage] PERIODIC TEST - Sending notification");
  //   post("Rugsense/ApproveDetected", {
  //     title: "Periodic Test",
  //     body: `Test at ${new Date().toLocaleTimeString()}`,
  //   });
  // }, 5000);

  // Debug: Tüm window object'lerini logla
  setTimeout(() => {
    console.log('[Rugsense/inpage] DEBUG - Window objects:', {
      ethereum: !!window.ethereum,
      web3: !!window.web3,
      remix: !!(window as any).remix,
      location: location.href,
      userAgent: navigator.userAgent,
      trackedAddresses: trackedAddresses,
    });

    // Tüm button'ları bul ve logla
    const allButtons = document.querySelectorAll('button');
    console.log('[Rugsense/inpage] DEBUG - Found buttons:', allButtons.length);
    allButtons.forEach((btn, i) => {
      if (i < 10) {
        // İlk 10 button'u logla
        console.log(`[Rugsense/inpage] Button ${i}:`, {
          text: btn.textContent,
          class: btn.className,
          id: btn.id,
          onclick: btn.onclick,
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
            const transactionButtons =
              element.querySelectorAll?.(
                'button[class*="transact"], button[class*="send"], button[class*="transfer"], ' +
                  'button[id*="transact"], button[id*="send"], button[id*="transfer"], ' +
                  'button[class*="run"], button[class*="execute"], button[class*="deploy"], ' +
                  'button[id*="run"], button[id*="execute"], button[id*="deploy"]'
              ) || [];

            transactionButtons.forEach((button) => {
              console.log(
                '[Rugsense/inpage] Transaction button found:',
                button
              );
              button.addEventListener('click', () => {
                console.log('[Rugsense/inpage] Transaction button clicked');
                post('Rugsense/ApproveDetected', {
                  title: 'Transaction Button Clicked',
                  body: 'Transaction button was clicked - review carefully',
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
    attributes: true,
  });

  // EIP-6963 ile duyurulan yeni sağlayıcıları dinle
  window.addEventListener(
    'eip6963:announceProvider' as any,
    (event: any) => {
      const p = event?.detail?.provider;
      if (p) {
        console.log('[Rugsense/inpage] eip6963:announceProvider');
        hookProvider(p, 'eip6963');
      }
    },
    { passive: true }
  );

  // Remix-specific event'leri dinle
  window.addEventListener('remix:transaction' as any, (event: any) => {
    console.log('[Rugsense/inpage] Remix transaction event:', event.detail);
    post('Rugsense/ApproveDetected', {
      title: 'Remix Transaction',
      body: 'Transaction detected in Remix IDE',
    });
  });

  // Web3 event'leri dinle
  window.addEventListener('web3:transaction' as any, (event: any) => {
    console.log('[Rugsense/inpage] Web3 transaction event:', event.detail);
    post('Rugsense/ApproveDetected', {
      title: 'Web3 Transaction',
      body: 'Transaction detected via Web3',
    });
  });

  // Tüm window event'lerini dinle (debug için)
  const originalAddEventListener = window.addEventListener;
  window.addEventListener = function (
    type: string,
    listener: any,
    options?: any
  ) {
    if (
      type.includes('transaction') ||
      type.includes('send') ||
      type.includes('transfer')
    ) {
      console.log(
        '[Rugsense/inpage] DEBUG - Window event listener added:',
        type
      );
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
  //       console.log("[Rugsense/inpage] DEBUG - Message event with transaction:", data);

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

  //       post("Rugsense/ApproveDetected", {
  //         title: "Message Transaction",
  //         body: `${transactionType} detected via message event\nContract: ${contractAddress}`,
  //       });
  //     }
  //   }
  // });

  // Sayfa ayrılırken interval'leri temizle
  window.addEventListener('beforeunload', () => {
    clearInterval(interval);
    observer.disconnect();
  });
})();
