/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { classNameFactory } from "@utils/css";
import { Forms, Modal, openModalLazy } from "@webpack/common";

const cl = classNameFactory("vc-uni-");

let unicodeNameMap: Record<number, string> | undefined;

async function requireMap() {
    if (!unicodeNameMap) {
        const data = await fetch("https://raw.githubusercontent.com/node-unicode/node-unicode-data/main/data/15.1.0-database.txt")
            .then(res => res.text());

        unicodeNameMap = Object.fromEntries(
            data.trim().split("\n").map(line => {
                const [code, name] = line.split(";");
                return [parseInt(code, 16), name];
            }));
    }

    return unicodeNameMap;
}

function Inspector({ map, content }: { map: Record<number, string>; content: string; }) {
    return (
        <div className={cl("table")}>
            {Array.from(content, (c, idx) => {
                const name = map[c.codePointAt(0)!];

                return (
                    <div className={cl("row")} key={idx}>
                        <Forms.FormText>{c}</Forms.FormText>
                        <Forms.FormText>{name}</Forms.FormText>
                    </div>
                );
            })}
        </div>
    );
}

export function openModal(content: string) {
    openModalLazy(async () => {
        const map = await requireMap();
        return modalProps => (
            <Modal {...modalProps} title="Unicode Inspector">
                <Inspector map={map} content={content} />
            </Modal>
        );
    });
}
