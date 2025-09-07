// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SimpleScam {
    string public name = "SafeMoon 2.0";
    string public symbol = "SAFE2";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    address public owner;
    address public marketingWallet;
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    
    constructor() {
        owner = msg.sender;
        marketingWallet = msg.sender;
        totalSupply = 1000000000 * 10**decimals;
        balanceOf[msg.sender] = totalSupply;
    }
    
    // 🚨 RED FLAG 1: Gizli fee
    function transfer(address to, uint256 amount) public returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        
        uint256 fee = (amount * 10) / 100; // %10 gizli fee
        
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += (amount - fee);
        balanceOf[marketingWallet] += fee;
        
        emit Transfer(msg.sender, to, amount - fee);
        if (fee > 0) {
            emit Transfer(msg.sender, marketingWallet, fee);
        }
        
        return true;
    }
    
    // 🚨 RED FLAG 2: Gizli mint
    function mint(address to, uint256 amount) public {
        require(msg.sender == owner, "Only owner can mint");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
    
    // 🚨 RED FLAG 3: Contract'ı boşaltma
    function drainContract() public {
        require(msg.sender == owner, "Only owner");
        payable(owner).transfer(address(this).balance);
    }
    
    // 🚨 RED FLAG 4: Owner değiştirme
    function changeOwner(address newOwner) public {
        require(msg.sender == owner, "Only owner");
        owner = newOwner;
    }
    
    // 🚨 RED FLAG 5: Reentrancy vulnerability
    function withdraw() public {
        require(balanceOf[msg.sender] > 0, "No balance");
        uint256 amount = balanceOf[msg.sender];
        balanceOf[msg.sender] = 0;
        
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }
    
    // 🚨 RED FLAG 6: Selfdestruct
    function kill() public {
        require(msg.sender == owner, "Only owner");
        selfdestruct(payable(owner));
    }
    
    // 🚨 RED FLAG 7: Delegatecall
    function execute(address target, bytes calldata data) public {
        require(msg.sender == owner, "Only owner");
        (bool success, ) = target.delegatecall(data);
        require(success, "Delegatecall failed");
    }
    
    // 🚨 RED FLAG 8: Block timestamp
    function getCurrentTime() public view returns (uint256) {
        return block.timestamp;
    }
    
    // 🚨 RED FLAG 9: Gizli fallback
    receive() external payable {}
    fallback() external payable {}
    
    // Normal approve
    function approve(address spender, uint256 amount) public returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
}
