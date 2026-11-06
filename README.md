# Çoklu AI Sohbet

OpenRouter üzerinden ChatGPT, Claude, Gemini, Llama ve diğer **tüm** modellerle konuşan, Claude benzeri bir sohbet arayüzü.

## Özellikler

- OpenRouter'daki bütün modellerin listesi. Ücretsiz modellerde **"Ücretsiz"** rozeti görünür.
- Model menüsünde arama ve filtreler: Ücretsiz, ChatGPT, Claude, Gemini, Görsel destekli.
- Fotoğraf ekleme: dosya seçerek, sürükle-bırak ile veya Ctrl+V ile yapıştırarak. Fotoğraflar otomatik küçültülür.
- PDF ve metin/kod dosyası ekleme.
- Cevaplar kelime kelime akarak gelir. Durdur butonu var.
- Markdown, renkli kod blokları ("Kopyala" butonlu), tablolar.
- Mesaj düzenleme, cevabı yeniden oluşturma, kopyalama.
- Düşünen modellerde "Düşünme süreci" bölümü.
- Sol menüde sohbet geçmişi: arama, yeniden adlandırma, silme.
- Ayarlarda sistem talimatı ve açık/koyu tema.
- Mobil uyumlu.
- Şifre koruması: linki bulan biri OpenRouter bakiyeni harcayamaz.

## Vercel'e yayınlama (yaklaşık 5 dakika)

1. **OpenRouter anahtarı al:** https://openrouter.ai/keys → "Create Key". Ücretli modeller için Credits sayfasından biraz bakiye yükle. Sadece ücretsiz modelleri kullanacaksan bakiye gerekmez.
2. **GitHub'a yükle:** Yeni bir **private** repo aç ve bu klasörü yükle. `.env` dosyası yükleme; `.gitignore` zaten engelliyor.
3. **Vercel'e bağla:** https://vercel.com/new → repoyu seç. Framework olarak Next.js otomatik tanınır.
4. **Environment Variables** bölümüne şunları ekle:
   - `OPENROUTER_API_KEY` = OpenRouter anahtarın
   - `ACCESS_PASSWORD` = siteye giriş şifresi (uzun ve tahmin edilemez olsun)
   - `AUTH_SECRET` = rastgele uzun bir metin (isteğe bağlı ama önerilir)
   - `DEFAULT_MODEL` = örneğin `openai/gpt-4o-mini` (isteğe bağlı)
5. **Deploy** butonuna bas. Çıkan `.vercel.app` linkini aç ve şifreyle gir.

> `ACCESS_PASSWORD` boş bırakılırsa site kimseyi içeri almaz. Bu bilinçli bir tercih; bakiyeni korumak için.

## Bilinmesi gerekenler

- **Sohbet geçmişi** sadece o tarayıcıda (localStorage) tutulur. Sunucuda kayıt veya log tutulmaz. Başka cihazdan girildiğinde geçmiş görünmez.
- **Gizlilik:** Yazılan her şey Vercel → OpenRouter → model sağlayıcısı (OpenAI, Anthropic vb.) zincirinden geçer. Ücretsiz modellerin bazı sağlayıcıları verileri eğitim için kullanabilir. Hassas veya şirket bilgisi yazmamak gerekir.
- **Boyut sınırı:** Vercel tek istekte en fazla ~4.5 MB kabul eder. Bu yüzden PDF en fazla 3 MB olabilir, fotoğraflar da küçültülerek gönderilir.
- **Süre sınırı:** Bir cevap en fazla 60 saniye sürebilir (`app/api/chat/route.ts` içindeki `maxDuration`). Vercel projende Fluid Compute açıksa bunu 300'e çıkarabilirsin.
- **Ücretsiz modeller:** OpenRouter'da günlük ve dakikalık istek sınırları vardır. "Hız sınırı" hatası görürsen biraz bekle veya başka model seç.
- **Görsel:** Fotoğraf eklediysen modelin "Görsel" rozeti olması gerekir. Rozet yoksa uygulama seni uyarır.

## Bilgisayarda çalıştırma

```bash
npm install
cp .env.example .env.local   # içini doldur
npm run dev                  # http://localhost:3000
```

## Dosya yapısı

- `app/api/chat/route.ts`: Mesajı OpenRouter'a iletir. Anahtar sadece burada kullanılır.
- `app/api/models/route.ts`: Model listesini çeker, ücretsizleri işaretler.
- `app/api/login/route.ts` ve `middleware.ts`: Şifre koruması.
- `components/Chat.tsx`: Ana arayüz.
- `components/ModelPicker.tsx`: Model seçme menüsü.
