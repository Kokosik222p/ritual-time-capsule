// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';

contract RitualTimeCapsule is ERC721 {
    uint256 private _nextTokenId = 1;
    mapping(address => uint256) public dailyMints;
    mapping(address => uint256) public lastMintDay;
    uint256 public constant DAILY_LIMIT = 3;

    constructor() ERC721('Ritual Time Capsule', 'RTC') {}

    function mintCapsule(address to, string calldata tokenURI) external returns (uint256) {
        uint256 today = block.timestamp / 1 days;

        if (lastMintDay[msg.sender] != today) {
            dailyMints[msg.sender] = 0;
            lastMintDay[msg.sender] = today;
        }

        if (dailyMints[msg.sender] >= DAILY_LIMIT) {
            revert("Daily mint limit reached (3 capsules per day)");
        }

        dailyMints[msg.sender] += 1;

        uint256 tokenId = _nextTokenId++;
        _mint(to, tokenId);
        return tokenId;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return 'data:application/json,{}';
    }
}
