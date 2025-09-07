# Rugsense - Web3 Security Extension

A comprehensive browser extension that provides real-time security analysis for Web3 transactions and smart contracts. Rugsense protects users from malicious contracts, rug pulls, and other security threats in the decentralized ecosystem.

## Features

### Real-time Transaction Monitoring
- Monitors Web3 transactions across all EVM-compatible networks
- Detects transactions from tracked wallet addresses
- Provides instant security alerts and analysis

### AI-Powered Contract Analysis
- Automated security analysis using pattern recognition
- Detects common vulnerabilities: reentrancy, overflow, access control issues
- Risk level assessment: HIGH, MEDIUM, LOW
- Provides specific recommendations for security improvements

### Blockchain-Based Reward System
- Aptos blockchain integration for first-time contract analysis rewards
- Smart contract written in Move language
- Testnet APT token rewards for early analysis contributors
- Prevents duplicate analysis through blockchain caching

### Smart Address Tracking
- Custom watchlist for wallet addresses
- Real-time alerts for tracked address transactions
- Easy address management with add/remove functionality
- Visual risk indicators with color coding

### Comprehensive Dashboard
- Modern MetaMask-style dropdown interface
- Transaction history with detailed information
- Cache statistics and blockchain submission status
- Multi-wallet support for Aptos ecosystem

## Technical Architecture

### System Components
```
Browser Extension <-> Extension Backend <-> Blockchain (Aptos)
       |                    |                    |
   Web3 Apps          AI Analysis Engine    Smart Contracts
(Remix, etc)         (Pattern Recognition)   (Move/Solidity)
```

### Technology Stack
- **Frontend**: TypeScript, ESBuild, Modern CSS
- **Blockchain**: Aptos (Move), Ethereum (Solidity)
- **AI/ML**: Hugging Face API, Pattern Recognition
- **Storage**: LocalStorage, Blockchain Storage
- **APIs**: Etherscan, Aptos Explorer

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/rugsense.git
cd rugsense
```

2. Install dependencies:
```bash
npm install
```

3. Build the extension:
```bash
npm run build
```

4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the project directory

## Usage

### Basic Setup
1. Install the extension in your browser
2. Click the Rugsense icon to open the dashboard
3. Add wallet addresses to your tracking list
4. Connect an Aptos wallet for blockchain rewards

### Transaction Monitoring
1. Navigate to any Web3 application (Remix IDE, Uniswap, etc.)
2. The extension automatically detects transactions
3. Security analysis runs in real-time
4. Receive instant alerts for potential risks

### Contract Analysis
1. When a tracked address interacts with a new contract
2. The extension performs automatic security analysis
3. Results are displayed with risk levels and recommendations
4. First-time analysis submissions earn APT token rewards

## Security Features

### Vulnerability Detection
- **Reentrancy Attacks**: Detects external call patterns
- **Integer Overflow**: Identifies unsafe arithmetic operations
- **Access Control**: Flags missing permission checks
- **Centralization Risks**: Warns about single-point-of-failure
- **Hidden Functions**: Discovers backdoor mechanisms
- **Assembly Code**: Alerts about low-level code usage

### Risk Assessment
- **HIGH**: Critical vulnerabilities requiring immediate attention
- **MEDIUM**: Moderate risks that should be addressed
- **LOW**: Minor issues or best practice violations

## Blockchain Integration

### Aptos Smart Contract
- **Contract Address**: `0x35b28662b4657b901cb36a37af124cc4d9eb067d654ad9ca68e9aedd376be5cf`
- **Network**: Aptos Testnet
- **Function**: `submit_analysis(contract_id, risk_level, summary)`
- **Reward**: 0.01 APT tokens for first-time analysis

### Supported Wallets
- Petra Wallet
- Martian Wallet
- Pontem Wallet

## Development

### Project Structure
```
src/
├── background.ts      # Service worker
├── content.ts         # Content script
├── inpage.ts          # Injected script
└── modules/           # Modular components
    ├── aptos.ts       # Blockchain integration
    ├── contractAnalysis.ts # Security analysis
    ├── uiComponents.ts # UI management
    └── utils.ts       # Utility functions
```

### Building
```bash
# Development build
npm run build

# Production build
npm run build:prod
```

### Testing
```bash
# Run tests
npm test

# Test with sample contracts
npm run test:contracts
```

## API Reference

### Contract Analysis
```typescript
interface AnalysisResult {
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  issues: string[];
  summary: string;
  recommendations: string[];
}
```

### Blockchain Submission
```typescript
interface BlockchainResult {
  contractHash: string;
  rewardAmount: string;
  status: 'success' | 'error' | 'already_exists';
  transactionHash?: string;
}
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit a pull request

## Roadmap

### Short-term (3-6 months)
- Multi-chain expansion (Solana, Avalanche)
- Advanced AI models for security analysis
- Mobile application development
- DeFi protocol integrations

### Medium-term (6-12 months)
- Enterprise security solutions
- White-label customization options
- Community governance system
- Advanced analytics dashboard

### Long-term (1-2 years)
- Global security network
- AI training platform for security experts
- Regulatory compliance features
- Insurance integration partnerships

## Security Considerations

This extension is designed for security analysis and should be used responsibly:

- Only use for legitimate security testing
- Do not attempt to exploit vulnerabilities in production contracts
- Report security issues through proper channels
- Respect the privacy and security of analyzed contracts

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, feature requests, or bug reports:
- Create an issue on GitHub
- Join our Discord community
- Follow us on Twitter

## Disclaimer

Rugsense is provided for educational and security analysis purposes. Users should always conduct their own research and due diligence before interacting with smart contracts. The extension does not guarantee the security of analyzed contracts and should not be the sole basis for investment decisions.