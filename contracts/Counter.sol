// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Counter {
    uint256 private _count;
    event CountChanged(uint256 newCount, address indexed changedBy);

    function count() external view returns (uint256) {
        return _count;
    }

    function increment() external {
        _count += 1;
        emit CountChanged(_count, msg.sender);
    }
}
