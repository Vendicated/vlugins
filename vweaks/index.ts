/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { WindowStore } from "@webpack/common";

export default definePlugin({
    name: "Vweaks",
    description: "Random Tweaks. Shit code and monkeypatching cause I'm lazy and it works.",
    authors: [Devs.Ven],

    start() {
        // Video Quest spoof
        WindowStore.isFocused = () => true;

        // Open payment modal for sku
        window.sku = (skuId: string) => Vencord.Webpack.findByCode("PAYMENT_MODAL_OPEN")({ skuId, analyticsLocations: ["payment flow test page"] });

        // Auto complete quests
        window.quests = async () => {
            const text = await fetch("https://gist.githubusercontent.com/aamiaa/204cd9d42013ded9faf646fae7f89fbb/raw/CompleteDiscordQuest.md")
                .then(res => res.text());
            const code = text.match(/```js\n(.+?)\n```/ms)![1];
            (0, eval)(code); // plz don't steal my token aaaaaaaaaaaaaaaaaaaaaaaaaaaaaamia
        };
    }
});
