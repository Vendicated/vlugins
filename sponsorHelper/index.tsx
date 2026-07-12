/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { Card } from "@components/Card";
import { Flex } from "@components/Flex";
import { Link } from "@components/Link";
import { Margins } from "@components/margins";
import { Paragraph } from "@components/Paragraph";
import { Devs } from "@utils/constants";
import definePlugin, { PluginNative } from "@utils/types";
import { Message } from "@vencord/discord-types";
import { ChannelStore, Menu, Modal, openModalLazy, Parser, React, showToast, Toasts } from "@webpack/common";

const Native = VencordNative.pluginHelpers.SponsorHelper as PluginNative<typeof import("./native")>;

const getMessageLink = ({ channelId, messageId }) => `https://discord.com/channels/0/${channelId}/${messageId}`;

export default definePlugin({
    name: "SponsorHelper",
    authors: [Devs.Ven],
    description: "You don't need this",

    contextMenus: {
        message(children, { message: msg }: { message: Message; }) {
            const channel = ChannelStore.getChannel(msg.channel_id);

            if (!channel.isPrivate()) return;

            const pdf = msg.attachments.find(a => a.filename.endsWith(".pdf"));
            if (!pdf) return;

            children.push(
                <Menu.MenuItem
                    id="vcsdndjsdj"
                    label="Check Receipt"
                    action={async () => {
                        openModalLazy(async () => {
                            const result = await Native.checkReceipt(pdf.url, {
                                userId: msg.author.id,
                                messageId: msg.id,
                                channelId: msg.channel_id
                            }).catch(e => {
                                showToast(String(e), Toasts.Type.FAILURE);
                            });

                            if (!result) return modalProps => (modalProps.onClose(), null);

                            const { date, ids, createdByPrawn, githubUsername, data: { country, firstSponsorshipDate, totalSponsorshipAmountInCents } } = result;

                            const cards = [
                                !createdByPrawn && <Card variant="warning">Receipt not created by Prawn</Card>,

                                ids.messageId !== msg.id && (
                                    <Card variant="warning">
                                        Receipt already checked in another message: {Parser.parse(getMessageLink(ids))}
                                    </Card>
                                ),

                                ids.userId !== msg.author.id && (
                                    <Card variant="warning">
                                        This GitHub user is associated with someone else: {Parser.parse(`<@${ids.userId}>`)}
                                    </Card>
                                )
                            ].filter(Boolean);

                            const textRows = [
                                ["User", <>
                                    <img alt="" src={`https://github.com/${githubUsername}.png?size=32`} style={{ width: "1lh", height: "1lh", borderRadius: "50%" }} />
                                    <Link href={`https://github.com/${githubUsername}`}>{githubUsername}</Link>
                                    <>({country.emoji} {country.name})</>
                                </>],
                                ["Total Amount", `$${(totalSponsorshipAmountInCents / 100).toFixed(2)}`],
                                ["Date", date.toLocaleDateString()],
                                ["First Date", firstSponsorshipDate.toLocaleDateString()],
                            ] as [string, React.ReactNode][];

                            return modalProps => (
                                <Modal
                                    {...modalProps}
                                    title="Receipt Info"
                                >
                                    {!!cards.length && <Flex flexDirection="column" gap="8px" className={Margins.bottom20}>{cards}</Flex>}

                                    <div className="vc-sponsorHelper-info">
                                        {textRows.map(([label, value]) => (
                                            <React.Fragment key={label}>
                                                <Paragraph><strong>{label}:</strong></Paragraph>
                                                <Paragraph><Flex alignItems="center" gap="6px">{value}</Flex></Paragraph>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </Modal>
                            );
                        });
                    }}
                />
            );
        }
    }
});
