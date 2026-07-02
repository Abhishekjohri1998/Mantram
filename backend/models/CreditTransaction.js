import mongoose from 'mongoose';

const creditTransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['purchase', 'debit', 'refund', 'bonus'], required: true },
    amount: { type: Number, required: true }, // positive for purchase/refund/bonus, negative for debit
    inrAmount: { type: Number, default: null }, // for purchases
    relatedJobId: { type: String, default: null }, // for video generation debits/refunds
    costInrAtDebit: { type: Number, default: null }, // snapshot of COGS at time of debit
    balanceAfter: { type: Number, required: true },
    referenceId: { type: String, default: null }, // for idempotency (e.g. Razorpay order ID / txn ID)
}, { timestamps: true });

export default mongoose.models.CreditTransaction || mongoose.model('CreditTransaction', creditTransactionSchema);
