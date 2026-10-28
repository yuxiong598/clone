// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

contract FixedVault {
    mapping(address => uint256) public balances;

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() public {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "Vault: nothing to withdraw");
        // 修复：先清零状态，再转账（遵循 Checks-Effects-Interactions 原则）
        balances[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "Vault: send failed");
    }

    function vaultBalance() public view returns (uint256) {
        return address(this).balance;
    }
}