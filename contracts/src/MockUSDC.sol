// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title MockUSDC
/// @notice Six-decimal test stablecoin for the StickerBomb Sepolia demo.
/// @dev Anyone can mint, so brands can top up a treasury without a faucet.
///      Never deploy outside a testnet.
contract MockUSDC {
    string public constant name = "StickerBomb Test USDC";
    string public constant symbol = "tUSDC";
    uint8 public constant decimals = 6;

    /// @notice Largest amount a single mint call may create (1,000,000 tUSDC).
    uint256 public constant MAX_MINT = 1_000_000 * 10 ** 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        require(to != address(0), "MockUSDC: zero address");
        require(amount <= MAX_MINT, "MockUSDC: mint too large");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "MockUSDC: allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(to != address(0), "MockUSDC: zero address");
        require(balanceOf[from] >= amount, "MockUSDC: balance");
        unchecked {
            balanceOf[from] -= amount;
        }
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
