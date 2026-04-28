const express  = require("express");
const Movement = require("../models/Movement");
const auth     = require("../middleware/auth");
const router   = express.Router();

router.use(auth);

// GET /api/movements?page=1&limit=50&type=IN&category=X&search=Y
router.get("/", async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip  = (page - 1) * limit;
    const filter = {};

    if (req.query.type && ["IN","OUT"].includes(req.query.type)) filter.type = req.query.type;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.search) {
      const rx = new RegExp(req.query.search.trim(), "i");
      filter.$or = [{ code: rx }, { description: rx }, { userName: rx }, { note: rx }];
    }

    const [movements, total] = await Promise.all([
      Movement.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Movement.countDocuments(filter),
    ]);

    res.json({ movements, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ message: "Errore nel recupero dei movimenti." });
  }
});

// POST /api/movements
router.post("/", async (req, res) => {
  try {
    const { code, description, qty, type, category, note } = req.body;

    if (!code || !qty || !type)
      return res.status(400).json({ message: "Campi obbligatori: code, qty, type." });
    if (!["IN","OUT"].includes(type))
      return res.status(400).json({ message: "type deve essere IN o OUT." });
    if (qty < 1)
      return res.status(400).json({ message: "Quantità minima: 1." });

    // Controllo scorte per uscite
    if (type === "OUT") {
      const [agg] = await Movement.aggregate([
        { $match: { code: code.toUpperCase().trim() } },
        { $group: { _id: null, qty: { $sum: { $cond: [{ $eq: ["$type","IN"] }, "$qty", { $multiply: ["$qty",-1] }] } } } },
      ]);
      const stock = agg?.qty ?? 0;
      if (stock < qty)
        return res.status(400).json({ message: `Scorta insufficiente. Disponibili: ${stock} pz.`, stock });
    }

    const movement = await Movement.create({
      code:        code.toUpperCase().trim(),
      description: (description || code.toUpperCase()).trim(),
      qty:         Number(qty),
      type,
      category:    category || "",
      note:        note?.trim() || "",
      userId:      req.user._id,
      userName:    req.user.name,
      userRole:    req.user.role,
    });

    res.status(201).json({ movement });
  } catch (err) {
    if (err.name === "ValidationError")
      return res.status(400).json({ message: Object.values(err.errors).map(e => e.message).join(", ") });
    res.status(500).json({ message: "Errore nella registrazione." });
  }
});

// GET /api/movements/stats/today
router.get("/stats/today", async (req, res) => {
  try {
    const start = new Date(); start.setHours(0,0,0,0);
    const results = await Movement.aggregate([
      { $match: { createdAt: { $gte: start } } },
      { $group: { _id: "$type", qty: { $sum: "$qty" }, count: { $sum: 1 } } },
    ]);
    const stats = { IN: { qty:0, count:0 }, OUT: { qty:0, count:0 } };
    results.forEach(r => { stats[r._id] = { qty: r.qty, count: r.count }; });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: "Errore statistiche." });
  }
});

module.exports = router;
