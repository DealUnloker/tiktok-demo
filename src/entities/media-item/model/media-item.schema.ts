import { z } from 'zod'

export const mediaItemSchema = z.object({
	id: z.string(),
	index: z.number().int().nonnegative(),
	title: z.string(),
	description: z.string(),
	hlsUrl: z.url(),
	// Virtual-clip start inside the stream (public CORS-enabled HLS test
	// streams are scarce, so unique feed items are cut from long streams by
	// start position).
	startSec: z.number().nonnegative(),
	posterUrl: z.url().nullable(),
	durationSec: z.number().positive(),
	author: z.object({
		name: z.string(),
		avatarUrl: z.url().nullable(),
	}),
	likes: z.number().int().nonnegative(),
})

export const feedPageSchema = z.object({
	items: z.array(mediaItemSchema),
	nextCursor: z.number().int().nonnegative().nullable(),
})

export type MediaItem = z.infer<typeof mediaItemSchema>
export type FeedPageData = z.infer<typeof feedPageSchema>
