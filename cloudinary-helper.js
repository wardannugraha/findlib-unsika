// ==============================================================================
// ☁️ CLOUDINARY HELPER UTILITY - FINDLIB UNSIKA
// ==============================================================================
// Menyediakan fungsi upload, hapus, dan konfigurasi Multer untuk Cloudinary
// dengan kebijakan Zero-Orphan & Optimasi Otomatis (WebP/Auto Quality).
// ==============================================================================

const cloudinary = require('cloudinary').v2;
const multer = require('multer');

// 1. Konfigurasi Cloudinary dari .env
if (process.env.CLOUDINARY_URL) {
  cloudinary.config({
    cloudinary_url: process.env.CLOUDINARY_URL
  });
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
}

// 2. Setup Multer (Memory Storage agar tidak meninggalkan sampah di disk server)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format file tidak didukung! Harap unggah gambar JPG, PNG, atau WebP.'), false);
  }
};

const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // Maksimal 5 MB
  }
});

/**
 * Upload Buffer ke Cloudinary via Stream
 * @param {Buffer} buffer - Buffer file dari multer (req.file.buffer)
 * @param {Object} options - { folder, public_id_prefix, transformation }
 * @returns {Promise<Object>} { success: true, url, public_id, width, height, format, bytes }
 */
function uploadToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const folder = options.folder || 'findlib-unsika/general';
    const prefix = options.prefix || 'img';
    const timestamp = Date.now();
    const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');
    const customPublicId = `${cleanPrefix}_${timestamp}`;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        public_id: customPublicId,
        resource_type: 'image',
        overwrite: true,
        transformation: options.transformation || [
          { quality: 'auto:good' },
          { fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) {
          console.error('❌ Cloudinary Upload Error:', error);
          return reject(error);
        }
        resolve({
          success: true,
          url: result.secure_url,
          public_id: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes
        });
      }
    );

    uploadStream.end(buffer);
  });
}

/**
 * Hapus Gambar dari Cloudinary
 * @param {string} publicId - ID gambar di Cloudinary
 * @returns {Promise<boolean>}
 */
async function deleteFromCloudinary(publicId) {
  if (!publicId || typeof publicId !== 'string' || publicId.trim() === '') {
    return false;
  }

  // Jika URL adalah link luar (Unsplash dll), lewati
  if (publicId.startsWith('http://') || publicId.startsWith('https://')) {
    return false;
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId.trim());
    console.log(`🗑️ Cloudinary Destroy (${publicId}):`, result.result);
    return result.result === 'ok';
  } catch (err) {
    console.warn(`⚠️ Gagal menghapus file Cloudinary (${publicId}):`, err.message);
    return false;
  }
}

module.exports = {
  cloudinary,
  uploadMiddleware,
  uploadToCloudinary,
  deleteFromCloudinary
};
