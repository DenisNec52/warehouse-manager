/**
 * routes/movements.js
 *
 * Gestione movimenti magazzino (entrate/uscite).
 * Aggiorna automaticamente la quantità del prodotto.
 * Salva snapshot del prodotto per storico permanente.
 *
 * GET  /api/movements           — lista movimenti
 * GET  /api/movements/:id       — dettaglio
 * POST /api/movements           — registra movimento
 * GET  /api/movements/product/:productId — storico per prodotto
 */
const express  = require("express");
const { body } = require("express-validator");
const mongoose = require("mongoose");
const Movement = require("../models/Movement");
const Product  = require("../models/Product");
const Notification = require("../models/Notification");
const { protect, requireAdmin } = require("../middleware/auth");
const validate    = require("../middleware/validate");
const email       = require("../utils/email");

const router = express.Router();
router.use(protect);

// ── GET /api/movements — lista con filtri ─────────────────────
router.get("/", async (req, res) => {
  try {
    const { type, productId, userId, page = 1, limit = 30, from, to } = req.query;
    const filter = {};

    if (type)      filter.type    = type;
    if (productId) filter.product = productId;
    if (userId)    filter.performedBy = userId;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
    }

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Movement.countDocuments(filter);

    const movements = await Movement.find(filter)
      .populate("product",     "name code unit")
      .populate("performedBy", "name username role")
      .sort("-createdAt")
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    res.json({
      movements,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    res.status(500).json({ message: "Errore recupero movimenti." });
  }
});

// ── GET /api/movements/product/:productId — storico prodotto ──
router.get("/product/:productId", async (req, res) => {
  try {
    const movements = await Movement.find({ product: req.params.productId })
      .populate("performedBy", "name username")
      .sort("-createdAt")
      .limit(100)
      .lean();
    res.json({ movements });
  } catch (err) {
    res.status(500).json({ message: "Errore." });
  }
});

// ── GET /api/movements/:id — dettaglio ───────────────────────
router.get("/:id", async (req, res) => {
  try {
    const m = await Movement.findById(req.params.id)
      .populate("product",     "name code unit category")
      .populate("performedBy", "name username role");
    if (!m) return res.status(404).json({ message: "Movimento non trovato." });
    res.json({ movement: m });
  } catch (err) {
    res.status(500).json({ message: "Errore." });
  }
});

// ── POST /api/movements — registra entrata o uscita ──────────
router.post("/",
  [
    body("productId").notEmpty().withMessage("Prodotto obbligatorio"),
    body("type").isIn(["IN","OUT"]).withMessage("Tipo deve essere IN o OUT"),
    body("quantity").isInt({ min: 1 }).withMessage("Quantità deve essere almeno 1"),
    body("reason").optional().trim(),
    body("note").optional().trim(),
    body("reference").optional().trim(),
  ],
  validate,
  async (req, res) => {
    // Usa una sessione MongoDB per transazione atomica
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { productId, type, quantity, reason, note, reference } = req.body;
      const qty = parseInt(quantity);

      // Blocca il prodotto durante l'operazione
      const product = await Product.findById(productId).session(session);
      if (!product || !product.isActive) {
        await session.abortTransaction();
        return res.status(404).json({ message: "Prodotto non trovato." });
      }

      // Per le uscite: verifica scorte sufficienti
      if (type === "OUT" && product.quantity < qty) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Scorte insufficienti. Disponibili: ${product.quantity} ${product.unit}.`,
          available: product.quantity,
        });
      }

      const qBefore = product.quantity;
      const qAfter  = type === "IN" ? qBefore + qty : qBefore - qty;

      // Snapshot della categoria per il record storico
      const catName = product.category
        ? (await (require("../models/Category")).findById(product.category).lean())?.name || ""
        : "";

      // Aggiorna quantità prodotto
      await Product.findByIdAndUpdate(
        productId,
        { quantity: qAfter, updatedBy: req.user._id },
        { session }
      );

      // Crea il record di movimento
      const movement = await Movement.create([{
        product:  productId,
        productSnapshot: {
          name:     product.name,
          code:     product.code,
          unit:     product.unit,
          category: catName,
        },
        type,
        quantity:       qty,
        quantityBefore: qBefore,
        quantityAfter:  qAfter,
        reason:         reason || "",
        note:           note || "",
        reference:      reference || "",
        performedBy:    req.user._id,
        performedByName: req.user.name,
      }], { session });

      await session.commitTransaction();

      // Notifica scorta bassa dopo uscita
      const wasOk = qBefore > product.minQuantity;
      const isNow = qAfter <= product.minQuantity;
      if (type === "OUT" && wasOk && isNow) {
        await Notification.create({
          type:    "low_stock",
          title:   `Scorta bassa — ${product.name}`,
          message: `Dopo l'uscita di ${qty} pz, la quantità è ${qAfter} ${product.unit} (soglia: ${product.minQuantity}).`,
          link:    `/products/${product._id}`,
        });
        const updatedProduct = { ...product.toObject(), quantity: qAfter };
        email.sendLowStockAlert(updatedProduct).catch(() => {});
      }

      // Movimento importante → notifica
      await Notification.create({
        type:    "movement",
        title:   `${type === "IN" ? "Entrata" : "Uscita"} — ${product.name}`,
        message: `${qty} ${product.unit} ${type === "IN" ? "aggiunti" : "rimossi"} da ${req.user.name}.`,
        link:    `/movements`,
        meta:    { movementId: movement[0]._id },
      });

      // Popola per la risposta
      await movement[0].populate("performedBy", "name username");

      res.status(201).json({ movement: movement[0] });
    } catch (err) {
      await session.abortTransaction();
      console.error("[movements/post]", err);
      res.status(500).json({ message: "Errore registrazione movimento." });
    } finally {
      session.endSession();
    }
  }
);

// ── Correzione / annullamento movimenti (solo admin) ─────────────
// La giacenza del prodotto viene riallineata nella stessa transazione:
// effetto di un movimento sulla scorta = +quantità (IN) / -quantità (OUT).
const stockEffect = (type, quantity) => (type === "IN" ? quantity : -quantity);
const typeLabel   = (type) => (type === "IN" ? "Entrata" : "Uscita");

async function loadMovementAndProduct(id, session) {
  if (!mongoose.isValidObjectId(id)) return { status: 404, message: "Movimento non trovato." };
  const movement = await Movement.findById(id).session(session);
  if (!movement) return { status: 404, message: "Movimento non trovato." };
  // Anche un prodotto disattivato va riallineato: la sua giacenza resta nello storico.
  const product = await Product.findById(movement.product).session(session);
  if (!product) return { status: 404, message: "Prodotto del movimento non trovato." };
  return { movement, product };
}

router.put("/:id", requireAdmin,
  [
    body("type").isIn(["IN", "OUT"]).withMessage("Tipo deve essere IN o OUT"),
    body("quantity").isInt({ min: 1 }).withMessage("Quantità deve essere almeno 1").toInt(),
    body("reason").optional().trim(),
    body("note").optional().trim(),
    body("reference").optional().trim(),
  ],
  validate,
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const found = await loadMovementAndProduct(req.params.id, session);
      if (found.status) {
        await session.abortTransaction();
        return res.status(found.status).json({ message: found.message });
      }
      const { movement, product } = found;
      const { type, quantity } = req.body;

      const newEffect = stockEffect(type, quantity);
      const newStock  = product.quantity + newEffect - stockEffect(movement.type, movement.quantity);
      if (newStock < 0) {
        await session.abortTransaction();
        return res.status(400).json({ message: `La correzione porterebbe la giacenza sotto zero (attuale: ${product.quantity} ${product.unit}).` });
      }

      // updateOne come nella creazione: niente validazione completa del prodotto
      // (i prodotti importati dall'inventario legacy possono avere campi incompleti).
      await Product.updateOne({ _id: product._id }, { quantity: newStock, updatedBy: req.user._id }, { session });

      const before = `${typeLabel(movement.type)} ${movement.quantity} ${product.unit}`;
      movement.set({
        type,
        quantity,
        reason:    req.body.reason ?? movement.reason ?? "",
        note:      req.body.note ?? movement.note ?? "",
        reference: req.body.reference ?? movement.reference ?? "",
        quantityAfter:   movement.quantityBefore + newEffect,
        correctedBy:     req.user._id,
        correctedByName: req.user.name,
        correctedAt:     new Date(),
      });
      await movement.save({ session });
      await session.commitTransaction();

      try {
        await Notification.create({
          type:    "movement",
          title:   `Movimento corretto — ${movement.productSnapshot?.name || product.name}`,
          message: `${before} → ${typeLabel(type)} ${quantity} ${product.unit}, corretto da ${req.user.name}. Giacenza: ${product.quantity} → ${newStock}.`,
          link:    "/movements",
          meta:    { movementId: movement._id },
        });
      } catch (err) {
        console.error("[movements/put] notifica", err.message);
      }

      await movement.populate("performedBy", "name username");
      res.json({ movement, quantity: newStock });
    } catch (err) {
      if (session.inTransaction()) await session.abortTransaction();
      console.error("[movements/put]", err);
      res.status(500).json({ message: "Errore correzione movimento." });
    } finally {
      session.endSession();
    }
  }
);

router.delete("/:id", requireAdmin, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const found = await loadMovementAndProduct(req.params.id, session);
    if (found.status) {
      await session.abortTransaction();
      return res.status(found.status).json({ message: found.message });
    }
    const { movement, product } = found;

    const newStock = product.quantity - stockEffect(movement.type, movement.quantity);
    if (newStock < 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: `Impossibile annullare: la giacenza andrebbe sotto zero (attuale: ${product.quantity} ${product.unit}).` });
    }

    await Product.updateOne({ _id: product._id }, { quantity: newStock, updatedBy: req.user._id }, { session });
    await Movement.deleteOne({ _id: movement._id }).session(session);
    await session.commitTransaction();

    // Il movimento sparisce dallo storico: la notifica resta come traccia dell'operazione.
    try {
      const unit = movement.productSnapshot?.unit || product.unit;
      await Notification.create({
        type:    "movement",
        title:   `Movimento annullato — ${movement.productSnapshot?.name || product.name}`,
        message: `${typeLabel(movement.type)} di ${movement.quantity} ${unit} del ${new Date(movement.createdAt).toLocaleDateString("it-IT")} annullata da ${req.user.name}. Giacenza: ${product.quantity} → ${newStock}.`,
        link:    "/movements",
      });
    } catch (err) {
      console.error("[movements/delete] notifica", err.message);
    }

    res.json({ message: "Movimento annullato.", quantity: newStock });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    console.error("[movements/delete]", err);
    res.status(500).json({ message: "Errore annullamento movimento." });
  } finally {
    session.endSession();
  }
});

module.exports = router;
