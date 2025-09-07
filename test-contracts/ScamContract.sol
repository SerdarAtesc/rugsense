// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ⚠️ UYARI: Bu contract sadece eğitim amaçlıdır!
 * Gerçek projelerde kullanmayın. Rugsense extension'ını test etmek için yazılmıştır.
 */

contract ScamToken {
    string public name = "SafeMoon 2.0";
    string public symbol = "SAFE2";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    address public owner;
    address public marketingWallet;
    bool public tradingEnabled = false;
    
    // Hidden backdoor - sadece owner'ın görebileceği
    mapping(address => bool) private _isExcludedFromFees;
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    
    constructor() {
        owner = msg.sender;
        marketingWallet = msg.sender; // Owner aynı zamanda marketing wallet
        totalSupply = 1000000000 * 10**decimals; // 1B tokens
        balanceOf[msg.sender] = totalSupply;
        
        // Owner'ı fee'lerden muaf tut
        _isExcludedFromFees[msg.sender] = true;
    }
    
    // 🚨 RED FLAG 1: Transfer fonksiyonunda gizli fee
    function transfer(address to, uint256 amount) public returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        
        uint256 fee = 0;
        if (!_isExcludedFromFees[msg.sender]) {
            fee = (amount * 10) / 100; // %10 gizli fee
        }
        
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += (amount - fee);
        balanceOf[marketingWallet] += fee; // Fee'yi marketing wallet'a gönder
        
        emit Transfer(msg.sender, to, amount - fee);
        if (fee > 0) {
            emit Transfer(msg.sender, marketingWallet, fee);
        }
        
        return true;
    }
    
    // 🚨 RED FLAG 2: TransferFrom'da aynı gizli fee
    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        
        uint256 fee = 0;
        if (!_isExcludedFromFees[from]) {
            fee = (amount * 10) / 100; // %10 gizli fee
        }
        
        balanceOf[from] -= amount;
        balanceOf[to] += (amount - fee);
        balanceOf[marketingWallet] += fee;
        allowance[from][msg.sender] -= amount;
        
        emit Transfer(from, to, amount - fee);
        if (fee > 0) {
            emit Transfer(from, marketingWallet, fee);
        }
        
        return true;
    }
    
    // 🚨 RED FLAG 3: Gizli mint fonksiyonu
    function mint(address to, uint256 amount) public {
        require(msg.sender == owner, "Only owner can mint");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
    
    // 🚨 RED FLAG 4: Owner'ın tüm token'ları çekebilmesi
    function drainContract() public {
        require(msg.sender == owner, "Only owner");
        payable(owner).transfer(address(this).balance);
    }
    
    // 🚨 RED FLAG 5: Gizli owner değiştirme
    function changeOwner(address newOwner) public {
        require(msg.sender == owner, "Only owner");
        owner = newOwner;
    }
    
    // 🚨 RED FLAG 6: Trading'i kapatabilme (rug pull için)
    function disableTrading() public {
        require(msg.sender == owner, "Only owner");
        tradingEnabled = false;
    }
    
    // 🚨 RED FLAG 7: Gizli fee muafiyeti ekleme
    function excludeFromFees(address account) public {
        require(msg.sender == owner, "Only owner");
        _isExcludedFromFees[account] = true;
    }
    
    // 🚨 RED FLAG 8: Marketing wallet değiştirme
    function setMarketingWallet(address newWallet) public {
        require(msg.sender == owner, "Only owner");
        marketingWallet = newWallet;
    }
    
    // 🚨 RED FLAG 9: Gizli approve fonksiyonu
    function approve(address spender, uint256 amount) public returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
    
    // 🚨 RED FLAG 10: Reentrancy vulnerability
    function withdraw() public {
        require(balanceOf[msg.sender] > 0, "No balance");
        uint256 amount = balanceOf[msg.sender];
        balanceOf[msg.sender] = 0;
        
        // Reentrancy attack'a açık
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }
    
    // 🚨 RED FLAG 11: Assembly kullanımı (güvenlik riski)
    function getBalance(address account) public view returns (uint256) {
        uint256 result;
        assembly {
            let slot := keccak256(abi.encodePacked(account, uint256(0)))
            result := sload(slot)
        }
        return result;
    }
    
    // 🚨 RED FLAG 12: Block timestamp manipulation
    function getCurrentTime() public view returns (uint256) {
        return block.timestamp; // Manipüle edilebilir
    }
    
    // 🚨 RED FLAG 13: Gizli selfdestruct
    function kill() public {
        require(msg.sender == owner, "Only owner");
        selfdestruct(payable(owner));
    }
    
    // 🚨 RED FLAG 14: Gizli delegatecall
    function execute(address target, bytes calldata data) public {
        require(msg.sender == owner, "Only owner");
        (bool success, ) = target.delegatecall(data);
        require(success, "Delegatecall failed");
    }
    
    // 🚨 RED FLAG 15: Gizli fallback
    receive() external payable {
        // Gizli ETH toplama
    }
    
    fallback() external payable {
        // Gizli ETH toplama
    }
}

/**
 * 🔍 Rugsense Extension'ın Tespit Edeceği Red Flag'ler:
 * 
 * 1. ✅ Gizli fee mekanizması
 * 2. ✅ Owner'ın tüm fonksiyonları kontrol etmesi
 * 3. ✅ Gizli mint fonksiyonu
 * 4. ✅ Contract'ı boşaltma fonksiyonu
 * 5. ✅ Owner değiştirme
 * 6. ✅ Trading'i kapatma
 * 7. ✅ Gizli fee muafiyeti
 * 8. ✅ Marketing wallet değiştirme
 * 9. ✅ Reentrancy vulnerability
 * 10. ✅ Assembly kullanımı
 * 11. ✅ Block timestamp kullanımı
 * 12. ✅ Selfdestruct fonksiyonu
 * 13. ✅ Delegatecall kullanımı
 * 14. ✅ Gizli fallback fonksiyonları
 * 15. ✅ Merkezi kontrol (centralization)
 */
