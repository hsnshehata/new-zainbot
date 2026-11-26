const mongoose = require('mongoose');

// Singleton document holding global platform-level settings editable from
// the Super Admin dashboard without changing environment variables.
const platformSettingSchema = new mongoose.Schema({
  key: {
    type: String,
    default: 'platform_settings',
    unique: true,
    immutable: true,
  },
  subscriptionWhatsappNumber: {
    type: String,
    default: '',
    trim: true,
    maxlength: 32,
  },
}, {
  timestamps: true,
  versionKey: false,
});

platformSettingSchema.statics.getConfig = async function getConfig() {
  let doc = await this.findOne({ key: 'platform_settings' });
  if (!doc) {
    try {
      doc = await this.create({ key: 'platform_settings' });
    } catch (err) {
      // Handle races between concurrent first reads.
      doc = await this.findOne({ key: 'platform_settings' });
      if (!doc) throw err;
    }
  }
  return doc;
};

module.exports = mongoose.model('PlatformSetting', platformSettingSchema);
