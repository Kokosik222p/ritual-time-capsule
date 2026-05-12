// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract RitualTimeCapsule is ERC721 {
    struct Capsule {
        uint64 unlockTimestamp;
        string tokenURI;        // один URI (sealed або opened)
    }

    uint256 private _nextTokenId = 1;
    mapping(uint256 => Capsule) private _capsules;
    mapping(address => uint256) public dailyMints;
    mapping(address => uint256) public lastMintDay;
    uint256 public constant DAILY_LIMIT = 3;

    error InvalidUnlockDate();
    error CapsuleDoesNotExist();
    error DailyMintLimitReached();

    event CapsuleMinted(uint256 indexed tokenId, address indexed owner, uint64 unlockTimestamp);

    constructor() ERC721("Ritual Time Capsule", "RTC") {}

    function mintCapsule(
        address to,
        uint64 unlockTimestamp,
        string calldata tokenURI
    ) external returns (uint256 tokenId) {
        uint256 normalizedTimestamp = block.timestamp;
        if (normalizedTimestamp > 1_000_000_000_000) {
            normalizedTimestamp = normalizedTimestamp / 1000;
        }
        uint256 today = normalizedTimestamp / 1 days;
        uint256 mintedToday = lastMintDay[msg.sender] == today ? dailyMints[msg.sender] : 0;

        if (mintedToday >= DAILY_LIMIT) {
            revert DailyMintLimitReached();
        }

        unchecked {
            dailyMints[msg.sender] = mintedToday + 1;
        }

        if (lastMintDay[msg.sender] != today) {
            lastMintDay[msg.sender] = today;
        }

        if (unlockTimestamp <= block.timestamp) revert InvalidUnlockDate();

        tokenId = _nextTokenId;
        unchecked {
            _nextTokenId = tokenId + 1;
        }
        _mint(to, tokenId);
        _capsules[tokenId] = Capsule({
            unlockTimestamp: unlockTimestamp,
            tokenURI: tokenURI
        });

        emit CapsuleMinted(tokenId, to, unlockTimestamp);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert CapsuleDoesNotExist();

        Capsule memory c = _capsules[tokenId];
        return c.tokenURI;   // фронтенд сам вирішує sealed/opened
    }

    function isOpened(uint256 tokenId) external view returns (bool) {
        if (_ownerOf(tokenId) == address(0)) revert CapsuleDoesNotExist();
        return block.timestamp >= _capsules[tokenId].unlockTimestamp;
    }
}
