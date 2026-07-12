/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readFile } from "node:fs/promises";

import { alpha3ToCountryName, alpha3ToEmoji, normaliseCountry } from "./countries";
import { type ParsedCSVRow, parseHeadersAndRows } from "./csvjs";

const SPONSORS_CSV_PATH = "/home/vee/Documents/Vendicated-sponsorships-all-time.csv";

export interface SponsorData {
    username: string;
    country: Record<"name" | "emoji", string>;
    totalSponsorshipAmountInCents: number;
    firstSponsorshipDate: Date;
}

/** format: $5.00 */
function parseDollarAmountInCent(amount: string) {
    return parseFloat(amount.replace(/[$,]/g, "")) * 100;
}

export async function findSponsorData(username: string, transactionId: string): Promise<SponsorData | null> {
    const { headers, rows } = parseHeadersAndRows(await readFile(SPONSORS_CSV_PATH, "utf-8"));

    const makeColumnGetter = (header: string) => {
        const index = headers.indexOf(header);
        return (row: ParsedCSVRow) => String(row[index]);
    };

    const getUsername = makeColumnGetter("Sponsor Handle");
    const getTransactionId = makeColumnGetter("Transaction ID");
    const getCountry = makeColumnGetter("Country");
    const getProcessedAmount = makeColumnGetter("Processed Amount");
    const getSponsorshipStartedOn = makeColumnGetter("Sponsorship Started On");

    const entry = rows.find(row => getUsername(row) === username && getTransactionId(row) === transactionId);
    if (!entry) return null;

    const entries = rows.filter(row => getUsername(row) === username);
    if (!entries.length) return null;

    const first = entries[0];
    const country = normaliseCountry(getCountry(first));

    return {
        username,
        country: {
            name: alpha3ToCountryName(country) ?? country,
            emoji: alpha3ToEmoji(country)
        },
        totalSponsorshipAmountInCents: entries.reduce((acc, row) => acc + parseDollarAmountInCent(getProcessedAmount(row)), 0),
        firstSponsorshipDate: new Date(getSponsorshipStartedOn(first))
    };
}
