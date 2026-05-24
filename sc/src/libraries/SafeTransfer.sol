// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "../interfaces/IERC20.sol";

library SafeTransfer {
    error TransferFailed();
    error TransferReturnedFalse();

    function safeTransfer(IERC20 token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        if (!success) revert TransferFailed();
        if (data.length > 0 && !abi.decode(data, (bool))) revert TransferReturnedFalse();
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount)
        );
        if (!success) revert TransferFailed();
        if (data.length > 0 && !abi.decode(data, (bool))) revert TransferReturnedFalse();
    }
}
