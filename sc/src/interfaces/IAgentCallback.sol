// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Request, Response, ResponseStatus} from "./SomniaAgentTypes.sol";

interface IAgentCallback {
    function handleResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory details
    ) external;
}
