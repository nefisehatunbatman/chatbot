# Çoklu AI Sohbet

OpenRouter üzerinden ChatGPT, Claude, Gemini, Llama ve diğer **tüm** modellerle konuşan, Claude benzeri bir sohbet uygulaması. Her kullanıcının kendi hesabı var; sohbetler ve dosyalar kalıcıdır, telefondan girildiğinde de görünür.

## Kim neyi kullanabilir?

| Kullanıcı | Gördüğü modeller | Kimin parası? |
|---|---|---|
| **Normal (ücretsiz)** | Sadece ücretsiz ChatGPT (gpt-oss) ve Google (Gemma vb.) modelleri | Hiç kredi harcanmaz |
| **Pro** (admin verir) | Tüm OpenRouter modelleri | Sitenin OpenRouter kredisi |
| **Admin** (`ADMIN_USERNAME`) | Tüm modeller + kullanıcı yönetimi | Sitenin OpenRouter kredisi |
| **Kendi OpenRouter anahtarı olan** | Tüm modeller | Kullanıcının kendi OpenRouter hesabı |
| **Kendi Gemini anahtarı olan** | Ek olarak Google'ın Gemini modelleri | Kullanıcının Google hesabı (ücretsiz kotası var) |

- "Sadece ücretsiz" kuralı **sunucuda** uygulanır: biri tarayıcıda hile yapıp ücretli bir model adı gönderse bile istek reddedilir, OpenRouter'a hiç gitmez.
- OpenRouter'da ücretsiz **Claude** modeli yok. Normal kullanıcılar Claude'u göremez; pro yetkisi ya da kendi OpenRouter anahtarı gerekir.
- **ChatGPT Plus/Pro ya da Gemini Advanced aboneliği API anahtarı değildir.** Abonelikler sadece kendi sitelerinde geçer. Bu sitede kullanmak için:
  - Gemini: aistudio.google.com → *Get API key* (ücretsiz kotası var)
  - Her şey: openrouter.ai/keys (kendi bakiyesiyle)
- Kullanıcı anahtarları veritabanında AES-256-GCM ile **şifreli** saklanır, ekranda sadece maskeli gösterilir (`AIza••••1234`). Kaydedilmeden önce çalışıp çalışmadığı kontrol edilir.

## Özellikler

- **Hesaplar:** Kullanıcı adı ve şifreyle giriş. Kayıt sadece davet koduyla yapılır. Herkes yalnızca kendi sohbetlerini görür.
- **Kalıcı sohbetler:** Konuşmalar veritabanında saklanır. Bilgisayardan yazdığını telefondan devam ettirebilirsin.
- **Kişisel ayarlar:** Sistem talimatı, tema ve son seçilen model hesabına kaydedilir.
- **Dosya ve fotoğraf:** Ataç butonu, sürükle-bırak veya Ctrl+V ile eklenir. Eklenen dosya **orijinal haliyle** indirilebilir (⬇ butonu). Modele ise fotoğrafın küçültülmüş kopyası gider.
- **Önerilen modeller:** Model menüsünün en üstünde iki grup var:
  - *Ücretsiz:* `gpt-oss-120b` ve `gpt-oss-20b`. OpenRouter kredisinden düşmez.
  - *En iyi ücretli:* en yeni ChatGPT, Claude Opus ve Claude Sonnet. Bunlar otomatik seçilir.
- Tüm modellerde "Ücretsiz" veya "Kredi kullanır" rozeti görünür. Arama ve filtre var: Ücretsiz, ChatGPT, Claude, Gemini, Görsel destekli.
- Akışlı cevap ve durdurma. Durdurulan cevabın yarısı da kaydedilir.
- Mesaj düzenleme, cevabı yeniden oluşturma, kopyalama, markdown, renkli kod blokları.
- Açık/koyu tema ve mobil uyumlu arayüz.

> **Not:** OpenRouter'da ücretsiz Claude modeli yok; tüm Claude modelleri kredi kullanır. Ücretsiz modellerin hız sınırı vardır ve OpenRouter bunları zamanla değiştirebilir. Önerilen liste her açılışta canlı olarak kontrol edilir.

## Vercel kurulumu

### 1. Veritabanı (zorunlu)
Vercel'de projeni aç → **Storage** → **Create Database** → **Neon** (Serverless Postgres) → projeye bağla.
`DATABASE_URL` otomatik eklenir. Tablolar ilk açılışta kendiliğinden oluşur.

### 2. Dosya deposu (önerilir)
**Storage** → **Create** → **Blob** → erişim olarak **Private** seç → projeye bağla.
`BLOB_READ_WRITE_TOKEN` otomatik eklenir.
- Blob varsa: dosya başına 25 MB, telefon fotoğrafları orijinal kalitede saklanır.
- Blob yoksa: dosyalar veritabanında tutulur, en fazla 4 MB. Büyük fotoğraflar 2560 px'e küçültülür.
- Blob'u *Public* oluşturduysan `BLOB_ACCESS=public` ekle.

### 3. Ortam değişkenleri
**Settings → Environment Variables** sayfasına şunları ekle:

| Ad | Değer |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter anahtarın |
| `INVITE_CODE` | Kayıt için davet kodu (uzun bir şey seç) |
| `ADMIN_USERNAME` | Senin kullanıcı adın (admin olur, pro yetkisi dağıtır) |
| `KEYS_SECRET` | En az 16 karakterlik rastgele metin. Kullanıcı anahtarlarını şifreler. **Sonradan değiştirme.** |

Eski sürümden kalan `ACCESS_PASSWORD` ve `AUTH_SECRET` artık kullanılmıyor, silebilirsin.

### 4. Yeniden deploy
**Deployments → ⋯ → Redeploy**. Ardından siteyi aç, **Kayıt ol** sekmesinden davet koduyla hesabını oluştur. Kullanıcı adı `ADMIN_USERNAME` ile aynı olmalı.

### 5. Pro yetkisi verme
Sol alttaki adına tıkla → **Ayarlar** → **Kullanıcıları yönet**. Listeden istediğin kişinin anahtarını **Pro** konumuna getir. Yetkiyi kaldırırsan o kişi bir sonraki mesajında yine sadece ücretsiz modelleri kullanabilir.

## Güvenlik notları

- Şifreler düz metin olarak saklanmaz; scrypt ile özetlenir. Oturumlar 30 gün geçerlidir.
- Dosyalar private depoda durur. Sadece yükleyen kişi, giriş yapmışken açabilir veya indirebilir.
- API anahtarı yalnızca sunucuda kullanılır, tarayıcıya hiç gönderilmez.
- Normal kullanıcılar senin kredini harcayamaz. Sadece pro yaptığın kişiler harcayabilir. Yine de OpenRouter'da anahtarına bir harcama limiti koymanı öneririm.
- Yazılanlar OpenRouter ve model sağlayıcısına (OpenAI, Anthropic vb.) gider. Ücretsiz modellerin bazı sağlayıcıları veriyi eğitimde kullanabilir. Hassas veya şirket bilgisi yazma.

## Bilgisayarda çalıştırma

```bash
npm install
cp .env.example .env.local   # DATABASE_URL, OPENROUTER_API_KEY, INVITE_CODE doldur
npm run dev                  # http://localhost:3000
```

## Dosya yapısı

- `app/api/chat`: Geçmişi veritabanından kurar, OpenRouter'a iletir, cevabı hem akıtır hem kaydeder.
- `app/api/auth/*`: Kayıt, giriş ve çıkış.
- `app/api/conversations/*`: Sohbet listesi, açma, yeniden adlandırma, silme.
- `app/api/files/*`: Yükleme (Blob veya veritabanı) ve indirme (sahiplik kontrollü).
- `app/api/models`: Kullanıcının görebileceği modeller ve önerilenler.
- `app/api/me/keys`: Kullanıcının kendi Gemini/OpenRouter anahtarı (şifreli).
- `app/api/admin/users`: Admin için kullanıcı listesi ve pro yetkisi.
- `lib/models.ts`: Kim hangi modeli, hangi anahtarla kullanır (erişim kuralları burada).
- `lib/db.ts`: Postgres bağlantısı ve otomatik tablo kurulumu.
- `components/Chat.tsx`: Ana arayüz.
