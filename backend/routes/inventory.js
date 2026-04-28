const express  = require("express");
const Movement = require("../models/Movement");
const auth     = require("../middleware/auth");
const router   = express.Router();

router.use(auth);

// GET /api/inventory
router.get("/", async (_req, res) => {
  try {
    const inventory = await Movement.aggregate([
      { $group: {
          _id:           "$code",
          description:   { $last: "$description" },
          lastCategory:  { $last: "$category" },
          lastMovement:  { $max: "$createdAt" },
          totalIn:       { $sum: { $cond: [{ $eq: ["$type","IN"] }, "$qty", 0] } },
          totalOut:      { $sum: { $cond: [{ $eq: ["$type","OUT"] }, "$qty", 0] } },
          movementCount: { $sum: 1 },
          qty: { $sum: { $cond: [{ $eq: ["$type","IN"] }, "$qty", { $multiply: ["$qty",-1] }] } },
      }},
      { $project: { _id:0, code:"$_id", description:1, lastCategory:1, lastMovement:1, totalIn:1, totalOut:1, movementCount:1, qty:1 } },
      { $sort: { code: 1 } },
    ]);

    const totals = inventory.reduce((acc, i) => ({
      totalItems:    acc.totalItems + i.qty,
      totalCodes:    acc.totalCodes + 1,
      lowStockCount: acc.lowStockCount + (i.qty < 50 ? 1 : 0),
    }), { totalItems:0, totalCodes:0, lowStockCount:0 });

    res.json({ inventory, totals });
  } catch (err) {
    res.status(500).json({ message: "Errore inventario." });
  }
});

// GET /api/inventory/:code
router.get("/:code", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase().trim();
    const [stock] = await Movement.aggregate([
      { $match: { code } },
      { $group: { _id:"$code", description:{ $last:"$description" }, qty:{ $sum:{ $cond:[{ $eq:["$type","IN"] },"$qty",{ $multiply:["$qty",-1] }] } }, totalIn:{ $sum:{ $cond:[{ $eq:["$type","IN"] },"$qty",0] } }, totalOut:{ $sum:{ $cond:[{ $eq:["$type","OUT"] },"$qty",0] } } } },
    ]);
    if (!stock) return res.status(404).json({ message: `Codice ${code} non trovato.` });
    const movements = await Movement.find({ code }).sort({ createdAt:-1 }).lean();
    res.json({ item: { code, ...stock, _id:undefined }, movements });
  } catch (err) {
    res.status(500).json({ message: "Errore dettaglio articolo." });
  }
});

module.exports = router;
