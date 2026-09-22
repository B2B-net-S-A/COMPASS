# MP4 validation fixtures

Real browser test media from [web-platform-tests/wpt](https://github.com/web-platform-tests/wpt/tree/2f43dbb9095f6d49790c6daccd8ff262e4b13aac/media), commit `2f43dbb9095f6d49790c6daccd8ff262e4b13aac`. The files are unmodified. Copyright web-platform-tests contributors; redistribution under the included BSD-3-Clause [license](./LICENSE.md). `test-1s.mp4` (AVC High/AAC-LC) and `movie_5.mp4` (AVC Baseline/AAC-LC) cover movie metadata after and before the media data. `2x2-green.mp4` is a real negative fixture: AVC video with MPEG-1 Layer III audio (`esds` object type 0x6b), despite an `mp4a` sample entry. Adversarial variants are made in memory in the tests.

| File | Bytes | SHA-256 |
|---|---:|---|
| `test-1s.mp4` | 13932 | `dc72b1b5591bbc9e2d0d6b511fa6d5134dd78dca6cf357244d656225f62a94b5` |
| `2x2-green.mp4` | 3503 | `f2923f95cb1653b6bb1b63a91b50940809d94708d68a2f2065bcad320aed0ff5` |
| `movie_5.mp4` | 31603 | `e2e2bd5b7641b88406a8db15410dc1ed55d89547cb29bd133491e4f90229e1e1` |
