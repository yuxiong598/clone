// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Intentionally vulnerable course exercise. Use only with test funds.
contract VulnerableVault {
    mapping(address => uint256) public balances;

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() public {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "Vault: nothing to withdraw");
        // BUG: the receiver can call withdraw again before its balance is reset.
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "Vault: send failed");
        balances[msg.sender] = 0;
    }

    function vaultBalance() public view returns (uint256) {
        return address(this).balance;
    }
}
