/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CspPolicies, ImageSrc } from "@main/csp";
import { fetchBuffer } from "@main/utils/http";
import { spawn } from "child_process";
import { IpcMainInvokeEvent } from "electron";
import { text } from "stream/consumers";

import { checkGithubUser } from "./database";
import { findSponsorData } from "./parser";

export type Context = Record<"userId" | "channelId" | "messageId", string>;

function spawnWithInput(command: string, args: string[], input: Buffer) {
    const proc = spawn(command, args);
    proc.stdin.write(input);
    proc.stdin.end();

    return text(proc.stdout);
}

const pdfInfo = (pdfData: Buffer) => spawnWithInput("pdfinfo", ["-"], pdfData);
const pdfText = (pdfData: Buffer) => spawnWithInput("pdftotext", ["-layout", "-", "-"], pdfData);

export async function checkReceipt(_event: IpcMainInvokeEvent, receiptFileURL: string, ctx: Context) {
    const url = new URL(receiptFileURL);
    if (url.host !== "cdn.discordapp.com" || !url.pathname.startsWith("/attachments/")) {
        throw new Error("Invalid receipt file URL");
    }

    const pdfData = await fetchBuffer(receiptFileURL);

    const [info, text] = await Promise.all([
        pdfInfo(pdfData),
        pdfText(pdfData)
    ]);

    const createdByPrawn = /Creator:\s*Prawn/.test(info);
    // text is in format 2026-04-05 04:00PM PDT. Extract the date part and parse it into a Date object
    const dateText = text.match(/Date\s*(\d{4}-\d{2}-\d{2})/i)?.[1];
    const date = dateText && new Date(dateText);

    const githubUsername = text.match(/Account billed\s+([A-Z0-9-]+)/i)?.[1];
    const transactionId = text.match(/Transaction ID\s+(ch_\S+)/i)?.[1];

    if (!date || !createdByPrawn || !githubUsername || !transactionId) {
        throw new Error("Invalid receipt file");
    }

    const data = await findSponsorData(githubUsername, transactionId);
    if (!data) {
        throw new Error("No sponsorship data found for this receipt");
    }

    const ids = await checkGithubUser(githubUsername, transactionId, ctx);

    return { createdByPrawn, date, githubUsername, transactionId, data, ids };
}

CspPolicies["avatars.githubusercontent.com"] = ImageSrc;
