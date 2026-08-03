import { create } from 'zustand'

type FeedState = {
	activeIndex: number
	setActiveIndex: (index: number) => void
}

export const useFeedStore = create<FeedState>((set) => ({
	activeIndex: 0,
	setActiveIndex: (index) => set({ activeIndex: index }),
}))
