/* eslint-disable simple-header/header */

/*
 * Based on https://github.com/An00nymushun/DiscordEmojiParty
 * Copyright (c) 2021 An00nymushun
 * Copyright (c) 2024 Mantikafasi & Vendicated
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MessageObject } from "@api/MessageEvents";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, DraftType, FluxDispatcher, Parser, PermissionsBits, PermissionStore, UploadHandler } from "@webpack/common";

const MAX_TEXT_HEIGHT = 10;
const MAX_TEXT_WIDTH = 100;
const EMOJI_IMAGE_SIZE = 128;
const EMOJI_URL_REGEX = /^https:\/\/cdn\.discordapp\.com\/emojis\/(\d{16,22})/;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 450;
const MIN_EMOJI_SIZE = 40;
const MAX_EMOJIS_FOR_DENSE_LAYOUT = 50;
const TEXT_LINE_HEIGHT = 40;

const formatEmojiUrl = (id: string) => `https://cdn.discordapp.com/emojis/${id}.png?size=${EMOJI_IMAGE_SIZE}`;

const FONT_OPTIONS = {
    textAlign: "center",
    font: 'bold 36px "gg sans"',
    fillStyle: "white",
    strokeStyle: "black",
    lineWidth: 6,
    textBaseline: "middle",
    miterLimit: 2,
    textRendering: "optimizeLegibility",
    letterSpacing: "0.24px"
};

interface CustomEmojiPart {
    type: "customEmoji";
    emojiId: string;
}

interface DiscordEmojiPart {
    type: "emoji";
    src: string;
    surrogate?: string;
}

interface TextPart {
    type: "text";
    content: string;
}

interface LinkPart {
    type: "link";
    target: string;
}

interface MentionPart {
    type: "mention";
    content?: any;
    userId?: string;
    roleId?: string;
}

interface ChannelPart {
    type: "channel";
    content?: any;
    channelId?: string;
}

type MessagePart =
    | CustomEmojiPart
    | DiscordEmojiPart
    | TextPart
    | LinkPart
    | MentionPart
    | ChannelPart;

const settings = definePluginSettings({
    emojiThreshold: {
        type: OptionType.NUMBER,
        description: "The number of emojis required to trigger the emoji party image generation.",
        default: 5,
    }
});

async function downloadBlob(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download file from ${url}`);
    }
    return response.blob();
}

function randomAveraged(start: number, end: number, rolls = 2) {
    const rangeAdjust = (end - start) / rolls;
    let sum = 0;
    for (let i = 0; i < rolls; i++) {
        sum += Math.random();
    }
    return sum * rangeAdjust + start;
}

function randomInRange(start: number, end: number) {
    return Math.random() * (end - start) + start;
}

const getMentionText = (messagePart: MentionPart | ChannelPart) => messagePart.content?.[0]?.content;
const getEmojiPartId = (part: CustomEmojiPart | DiscordEmojiPart) =>
    part.type === "customEmoji" ? part.emojiId : part.src;

function processMessageParts(messageParts: MessagePart[]) {
    let previousPart: MessagePart | undefined;
    const fallthroughParts: string[] = [];
    const textParts: string[] = [];
    const emojiParts: Array<CustomEmojiPart | DiscordEmojiPart> = [];

    for (const messagePart of messageParts) {
        switch (messagePart.type) {
            case "text":
                if (messagePart.content !== " " || !previousPart?.type.endsWith("moji")) {
                    textParts.push(messagePart.content);
                }
                break;

            case "link": {
                const emojiLinkMatch = EMOJI_URL_REGEX.exec(messagePart.target!);
                if (emojiLinkMatch) {
                    emojiParts.push({ type: "customEmoji", emojiId: emojiLinkMatch[1] });
                } else {
                    fallthroughParts.push(messagePart.target!);
                }
                break;
            }

            case "mention":
                textParts.push(getMentionText(messagePart));
                fallthroughParts.push(
                    messagePart.userId ? `<@${messagePart.userId}>` : `<@&${messagePart.roleId}>`
                );
                break;

            case "channel":
                textParts.push("#" + getMentionText(messagePart));
                fallthroughParts.push(`<#${messagePart.channelId}>`);
                break;

            case "emoji":
                if (messagePart.src) {
                    emojiParts.push(messagePart as DiscordEmojiPart);
                } else {
                    textParts.push(messagePart.surrogate!);
                }
                break;

            case "customEmoji":
                emojiParts.push(messagePart as CustomEmojiPart);
                break;

            default:
                const { content } = messagePart as any;

                if (Array.isArray(content)) {
                    const parts = processMessageParts(content);

                    fallthroughParts.push(...parts.fallthroughParts);
                    textParts.push(...parts.textParts);
                    emojiParts.push(...parts.emojiParts);
                } else {
                    fallthroughParts.push(content);
                }
                break;
        }
        previousPart = messagePart;
    }

    return { fallthroughParts, textParts, emojiParts };
}

function drawWithRandomTilt(ctx: CanvasRenderingContext2D, image: CanvasImageSource, x: number, y: number, width: number, height: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(randomAveraged(-Math.PI, Math.PI, 4));
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.restore();
}

function scaleSize(targetSize: number, width: number, height: number) {
    let scaledWidth = width;
    let scaledHeight = height;

    if (width > targetSize || height > targetSize) {
        const scale = targetSize / Math.max(width, height);
        scaledWidth = width * scale;
        scaledHeight = height * scale;
    }

    const imageSize = Math.max(scaledWidth, scaledHeight);
    const halfImageSize = imageSize / 2;

    return { width: scaledWidth, height: scaledHeight, imageSize, halfImageSize };
}

async function loadEmojiImage(emojiId: string, emojiPart: CustomEmojiPart | DiscordEmojiPart): Promise<HTMLImageElement> {
    const img = new Image();

    if (emojiPart.type === "customEmoji") {
        const imageBuffer = await downloadBlob(formatEmojiUrl(emojiId));
        const imageUrl = URL.createObjectURL(imageBuffer);

        img.src = imageUrl;
        await img.decode();

        URL.revokeObjectURL(imageUrl);
    } else {
        img.src = emojiId;
        await img.decode();
    }

    return img;
}

function drawDenseLayout(ctx: CanvasRenderingContext2D, emojiParts: Array<CustomEmojiPart | DiscordEmojiPart>, emojiImages: Record<string, HTMLImageElement>) {
    for (const part of emojiParts) {
        const image = emojiImages[getEmojiPartId(part)];
        const desiredSize = MIN_EMOJI_SIZE + Math.random() * 10;
        const { width, height, halfImageSize } = scaleSize(desiredSize, image.width, image.height);

        const x = randomInRange(halfImageSize, CANVAS_WIDTH - halfImageSize);
        const y = randomInRange(halfImageSize, CANVAS_HEIGHT - halfImageSize);

        drawWithRandomTilt(ctx, image, x, y, width, height);
    }
}

function drawSpacedLayout(ctx: CanvasRenderingContext2D, emojiParts: Array<CustomEmojiPart | DiscordEmojiPart>, emojiImages: Record<string, HTMLImageElement>) {
    const emojiPlaces: [number, number, number][] = [];

    for (const part of emojiParts) {
        const image = emojiImages[getEmojiPartId(part)];
        const desiredSize = Math.max(MIN_EMOJI_SIZE, 128 - Math.random() * emojiParts.length * 2);
        const { width, height, halfImageSize } = scaleSize(desiredSize, image.width, image.height);

        let bestX = 0, bestY = 0;
        let biggestNearestNeighborDistance = Number.NEGATIVE_INFINITY;

        while (true) {
            const randomX = randomInRange(halfImageSize, CANVAS_WIDTH - halfImageSize);
            const randomY = randomInRange(halfImageSize, CANVAS_HEIGHT - halfImageSize);

            let closestDistance = Number.POSITIVE_INFINITY;
            let regenerationChance = 0;

            for (const [otherX, otherY, otherSize] of emojiPlaces) {
                const imageSizes = halfImageSize + otherSize;
                const deltaX = randomX - otherX;
                const deltaY = randomY - otherY;
                const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                const overlapDistance = distance - imageSizes;

                if (overlapDistance < closestDistance) {
                    closestDistance = overlapDistance;
                    regenerationChance = Math.min(Math.log((imageSizes * 2) / distance), 0.95);
                }
            }

            if (closestDistance > biggestNearestNeighborDistance) {
                bestX = randomX;
                bestY = randomY;
                biggestNearestNeighborDistance = closestDistance;
            }

            if (regenerationChance <= Math.random()) break;
        }

        emojiPlaces.push([bestX, bestY, halfImageSize]);
        drawWithRandomTilt(ctx, image, bestX, bestY, width, height);
    }
}

function drawTextLines(ctx: CanvasRenderingContext2D, textParts: string[]) {
    const centerX = CANVAS_WIDTH / 2;
    const offsetY = CANVAS_HEIGHT / 2 - (TEXT_LINE_HEIGHT / 2) * (textParts.length - 1);

    for (let i = 0; i < textParts.length; i++) {
        const textPart = textParts[i];
        const posY = offsetY + i * TEXT_LINE_HEIGHT;

        ctx.strokeText(textPart, centerX, posY, CANVAS_WIDTH);
        ctx.fillText(textPart, centerX, posY, CANVAS_WIDTH);
    }
}

async function renderUploadEmojiParty(channelId: string, message: MessageObject, messageParts: MessagePart[]) {
    let { emojiParts, fallthroughParts, textParts } = processMessageParts(messageParts);

    textParts = textParts
        .join("")
        .split("\n")
        .map(line => line.trim())
        .filter(line => line !== "");

    if (textParts.length > MAX_TEXT_HEIGHT || Math.max(...textParts.map(line => line.length)) > MAX_TEXT_WIDTH) {
        return null;
    }

    message.content = fallthroughParts.join(" ");

    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d")!;

    Object.assign(ctx, FONT_OPTIONS);

    const uniqueEmojiMap = new Map(emojiParts.map(part => [getEmojiPartId(part), part]));
    const emojiImages = Object.fromEntries(
        await Promise.all(
            [...uniqueEmojiMap].map(async ([emojiId, emojiPart]) => {
                const img = await loadEmojiImage(emojiId, emojiPart);
                return [emojiId, img] as const;
            })
        )
    );

    if (emojiParts.length > MAX_EMOJIS_FOR_DENSE_LAYOUT) {
        drawDenseLayout(ctx, emojiParts, emojiImages);
    } else {
        drawSpacedLayout(ctx, emojiParts, emojiImages);
    }

    drawTextLines(ctx, textParts);

    return new Promise<Blob | null>(resolve => canvas.toBlob(resolve));
}

export default definePlugin({
    name: "EmojiParty",
    description: "Create a fun emoji party image when sending messages with lots of emojis!",
    authors: [{ name: "An0", id: 282414867506528259n }, Devs.mantikafasi, Devs.Ven],

    settings,

    async onBeforeMessageSend(channelId, message, extra) {
        const channel = ChannelStore.getChannel(channelId);
        if (!channel.isPrivate() && !PermissionStore.can(PermissionsBits.ATTACH_FILES, channel)) {
            return;
        }

        const messageParts: MessagePart[] = (Parser as any).parseToAST(message.content, true, { channelId });

        const emojiCount = messageParts.filter(part => {
            return part.type === "customEmoji" ||
                (part.type === "emoji" && part.src) ||
                (part.type === "link" && EMOJI_URL_REGEX.test(part.target));
        }).length;

        if (emojiCount < settings.store.emojiThreshold) return;

        const blob = await renderUploadEmojiParty(channelId, message, messageParts);

        if (blob) {
            const file = new File([blob], "EmojiParty.png", { type: blob.type });

            FluxDispatcher.dispatch({
                type: "DRAFT_CLEAR",
                channelId: channelId,
                draftType: DraftType.ChannelMessage
            });
            setTimeout(() => UploadHandler.promptToUpload([file], channel, DraftType.ChannelMessage), 10);
            return { cancel: true };
        }
    },
});

