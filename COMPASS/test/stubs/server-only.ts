// Stub `server-only` na potrzeby testów jednostkowych.
//
// Pakiet `server-only` celowo rzuca przy imporcie ze środowiska klienckiego —
// to guard bundlera Next.js, egzekwowany podczas `next build`. Vitest uruchamia
// testy na happy-dom (środowisko klienckie) i nie ma podziału na bundle, więc
// bez tego stubu żadnego modułu serwerowego nie da się w ogóle zaimportować
// w teście. Podmiana jest w vitest.config.ts (resolve.alias).
//
// Guard nie jest przez to osłabiony: `next build` nadal użyje prawdziwego pakietu
// i wywali build, jeśli moduł serwerowy trafi do bundla klienckiego.
export {}
