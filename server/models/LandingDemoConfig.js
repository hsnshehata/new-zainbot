const mongoose = require('mongoose');

// Singleton document holding the configuration of the real AI agent that
// powers the "Try it live" demo chat on the marketing landing page.
const landingDemoConfigSchema = new mongoose.Schema({
  key: {
    type: String,
    default: 'landing_demo',
    unique: true,
    immutable: true,
  },
  isEnabled: {
    type: Boolean,
    default: true,
  },
  instructions: {
    type: String,
    default: '',
    maxlength: 12000,
    trim: true,
  },
  // Global fail-closed budget: at most dailyCap paid AI completions per UTC
  // day across ALL visitors. The per-IP limiter is abuse control, not a
  // budget - a cap is. 0 disables demo replies entirely. Consumption is
  // atomic (findOneAndUpdate under a $lt filter), so concurrent bursts
  // cannot overshoot.
  dailyCap: {
    type: Number,
    default: 300,
    min: 0,
    max: 100000,
  },
  usageDate: {
    type: String,
    default: '',
  },
  usageCount: {
    type: Number,
    default: 0,
    min: 0,
  },
}, {
  timestamps: true,
  versionKey: false,
});

landingDemoConfigSchema.statics.getConfig = async function getConfig() {
  let doc = await this.findOne({ key: 'landing_demo' });
  if (!doc) {
    try {
      doc = await this.create({ key: 'landing_demo' });
    } catch (err) {
      // Handle races between concurrent first reads.
      doc = await this.findOne({ key: 'landing_demo' });
      if (!doc) throw err;
    }
  }
  return doc;
};

module.exports = mongoose.model('LandingDemoConfig', landingDemoConfigSchema);
