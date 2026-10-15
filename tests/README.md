# Firestore rules tests

`firestore.rules` is app ka asli security boundary hai. Client code aur Cloud
Functions ke checks defence-in-depth hain — koi bhi unhe bypass karke seedha
Firestore REST API hit kar sakta hai. Tab sirf ye rules bachati hain.

Isliye in tests ka pass hona deploy ki shart hona chahiye.

## Chalaiye

```bash
npm test
```

Emulator apne aap start aur stop hota hai. **Koi live Firebase project, koi
Blaze plan, koi credentials nahi chahiye** — sab kuch locally chalta hai.

Pehli baar chalane par emulator JAR download hoga (~60 MB, ek baar).

### Zaroorat

- Node 20+ (built-in test runner ke liye)
- Java 11+ (Firestore emulator ke liye) — `java -version` se check kar lijiye

## Kya cover hota hai (48 tests)

| Group | Kya check hota hai |
|---|---|
| **cross-user isolation** | Bob kisi bhi tarah Alice ka profile/habits/logs na padh sake, na likhe, na delete kare |
| **unauthenticated access** | Signed-out user ko kahin bhi kuch na mile |
| **privilege escalation** | User khud ko admin na bana sake, uid/email na badal sake, apna doc delete na kar sake |
| **owner happy paths** | Rules itni sakht na ho jayein ki app hi na chale |
| **habit validation** | Naam ki length, type, weeklyGoal ka range |
| **log validation** | Doc id ka `YYYY-MM-DD` format, `completed` map ho, max 100 keys |
| **admin access** | Admin padh sake, par `admin_stats` likh na sake aur user data chhu na sake |
| **default deny** | Undeclared collections band rahein — aur purana public account path ab dead ho |

## Naya collection add karte waqt

`default deny` group jaan-boojh kar hai. Agar aap naya collection add karein aur
uske rules likhna bhool jayein, to wo apne aap **band** rehna chahiye — khula
nahi. Ye wahi galti thi jo purane model mein thi (sab kuch `public/` ke neeche).

Naya collection add karne par uska explicit test bhi likhiye, dono taraf ka:
kaun padh sakta hai, aur kaun nahi.

## Ek gap jo in tests ko likhte waqt mila

`users/{uid}` ka `create` rule email ko token se match karta tha, par `update`
nahi karta tha. Yaani user pehle sahi email se profile banata, phir use badal kar
kisi aur ka email likh deta — admin panel galat data dikhata.

Fix `firestore.rules` mein hai, aur test is group mein:

```
privilege escalation › Alice baad mein apna email badal kar dusre ka nahi likh sakti
```

## Status

⚠️ **Ye tests abhi tak kabhi execute nahi hue.**

Jis sandbox mein ye likhe gaye, wahan emulator JAR download block tha
(`storage.googleapis.com` allowlist mein nahi). Verify sirf itna hua:

- ✅ Syntax valid (`node --check`)
- ✅ Saare imports resolve hote hain
- ✅ 48 tests discover hote hain
- ❌ Ek bhi test actually chala nahi

Pehli baar `npm test` chalane par kuch assertions adjust karni pad sakti hain.
Jo bhi fail ho use seedha mat badal dijiye — pehle dekhiye ki galti test mein hai
ya rules mein. Aksar rules mein hoti hai; test ka kaam wahi pakadna hai.
