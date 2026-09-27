/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, SQLTagStore } from "node:sqlite";

import { DATA_DIR } from "@main/utils/constants";
import { fetchJson } from "@main/utils/http";

import { Context } from ".";

const DB_DIR = join(DATA_DIR, "sponsorHelper");

export const db = new DatabaseSync(join(DB_DIR, "sqlite.db"), { open: false });
export let sql: SQLTagStore;

export function prepareDB() {
    mkdirSync(DB_DIR, { recursive: true });

    if (!db.isOpen) db.open();

    sql = db.createTagStore();

    db.exec(`
        CREATE TABLE IF NOT EXISTS sponsors (
            githubId TEXT PRIMARY KEY,
            discordId TEXT NOT NULL
        ) STRICT;

        CREATE TABLE IF NOT EXISTS receipts (
            transactionId TEXT PRIMARY KEY,
            githubUserId TEXT NOT NULL,
            channelId TEXT NOT NULL,
            messageId TEXT NOT NULL,
            FOREIGN KEY (githubUserId) REFERENCES sponsors(githubId)
        ) STRICT;
    `);
}

export async function checkGithubUser(username: string, transactionId: string, ctx: Context) {
    const { id: githubAccountId } = await fetchJson(`https://api.github.com/users/${username}`, {
        headers: {
            "User-Agent": "Vencord Sponsor Helper",
            "Authorization": `BEARER ${process.env.HUBBER}`
        }
    });

    prepareDB();

    const sponsorRow = sql.get`
        INSERT INTO sponsors (githubId, discordId)
        VALUES (${githubAccountId}, ${ctx.userId})
        ON CONFLICT(githubId) DO UPDATE SET githubId=excluded.githubId
        RETURNING discordId
    `!;

    const receiptRow = sql.get`
        INSERT INTO receipts (transactionId, githubUserId, channelId, messageId)
        VALUES (${transactionId}, ${githubAccountId}, ${ctx.channelId}, ${ctx.messageId})
        ON CONFLICT(transactionId) DO UPDATE SET transactionId=excluded.transactionId
        RETURNING channelId, messageId
    `!;

    return {
        userId: sponsorRow.discordId as string,
        channelId: receiptRow.channelId as string,
        messageId: receiptRow.messageId as string
    };
}
