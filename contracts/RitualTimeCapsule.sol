// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';

contract RitualTimeCapsule is ERC721 {
    uint256 private _nextTokenId = 1;

    constructor() ERC721('Ritual Time Capsule', 'RTC') {}

    function mintCapsule(address to, string calldata tokenURI) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _mint(to, tokenId);
        return tokenId;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return 'data:application/json,{}';
    }
}
