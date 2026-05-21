// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ILLMAgent {
    function inferString(
        string calldata prompt,
        string calldata system,
        bool chainOfThought,
        string[] calldata allowedValues
    ) external returns (string memory);

    function inferNumber(
        string calldata prompt,
        string calldata system,
        int256 minValue,
        int256 maxValue,
        bool chainOfThought
    ) external returns (int256);

    function inferChat(
        string[] calldata roles,
        string[] calldata messages,
        bool chainOfThought
    ) external returns (string memory);
}
