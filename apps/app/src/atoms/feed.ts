import { atom } from 'jotai';

export const feedGeneratorUriAtom = atom<string>(
  'at://did:plc:q6gjnaw2blty4crticxkmujt/app.rocksky.feed.generator/rocksky',
);
export const followingFeedAtom = atom<boolean>(false);
export const feedAtom = atom<string>('all');
export const feedUrisAtom = atom<Record<string, string>>({
  all: 'at://did:plc:q6gjnaw2blty4crticxkmujt/app.rocksky.feed.generator/rocksky',
});
