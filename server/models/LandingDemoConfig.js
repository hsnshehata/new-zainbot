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
  // Global fail-closed REQUEST-COUNT limit: at most dailyCap demo AI
  // replies per UTC day across ALL visitors. This limits request count
  // only; it is not a financial budget, not a spending envelope, and not
  // authority for any other paid path. DEFAULT 0: no paid demo replies
  // unless the owner explicitly configures a positive cap. Consumption is
  // atomic (findOneAndUpdate under a $lt filter), so concurrent bursts
  // cannot overshoot.
  dailyCap: {
    type: Number,
    default: 0,
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
