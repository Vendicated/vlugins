/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findComponentByCodeLazy } from "@webpack";
import { Tooltip } from "@webpack/common";

const ChannelMessage = findComponentByCodeLazy("childrenExecutedCommand:", ".hideAccessories");

export default definePlugin({
    name: "ReplyTooltip",
    description: "This shit is broken.",
    authors: [Devs.Ven],

    patches: [{
        find: ".repliedTextPreview,",
        replacement: {
            // discord has two branches for LOADED and NOT_LOADED
            match: /\((\i\.Clickable),\{(?=className:.{0,20}\.repliedTextPreview)/g,
            replace: "($self.ReplyWrapper,{OriginalComponent:$1,vcProps:arguments[0],"
        }
    }],

    ReplyWrapper: ErrorBoundary.wrap(({ OriginalComponent, vcProps, ...originalProps }) => {
        const { referencedMessage: { message }, channel } = vcProps;
        return (
            <Tooltip
                tooltipClassName="vc-replyTooltip"
                text={() => (
                    <ChannelMessage
                        id={`message-link-tooltip-${message.id}`}
                        message={message}
                        channel={channel}
                        subscribeToComponentDispatch={false}
                        compact={false}
                    />
                )}
            >
                {tooltipProps => (
                    <OriginalComponent {...tooltipProps} {...originalProps} />
                )}
            </Tooltip>
        );
    })
});
