/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { Devs } from "@utils/constants";
import { openUserProfile } from "@utils/discord";
import definePlugin from "@utils/types";

const DiscordIdRegex = /^(?:<@!?)?(\d{17,20})>?$/;

export default definePlugin({
    name: "Whois",
    description: "Adds a /whois slash command that allows you to view a user's profile by their ID",
    authors: [Devs.Ven],

    commands: [{
        name: "whois",
        description: "view a user's profile",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "user",
                description: "user id",
                type: ApplicationCommandOptionType.STRING,
                required: true
            },
        ],

        async execute(args, ctx) {
            const userId = findOption<string>(args, "user")!.match(DiscordIdRegex)?.[1];
            if (!userId)
                return sendBotMessage(ctx.channel.id, { content: "stupid" });

            try {
                await openUserProfile(userId!);
            } catch (e: any) {
                return sendBotMessage(ctx.channel.id, {
                    content: `Failed to open user profile: ${e?.message ?? e}`
                });
            }
        },
    }]
});
