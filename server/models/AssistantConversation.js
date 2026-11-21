const mongoose = require('mongoose');

const assistantMessageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true, maxlength: 8000 },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const assistantConversationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, trim: true, default: '', maxlength: 120 },
  messages: { type: [assistantMessageSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

assistantConversationSchema.index({ user: 1, updatedAt: -1 });

module.exports = mongoose.model('AssistantConversation', assistantConversationSchema);
