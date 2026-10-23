/* Detention Club: the three formal customer emails and the Claude Cowork prompts. Loaded before admin.js. */
(function () {
  "use strict";
  var EMAIL = "detentionclub0@gmail.com";
  function bd(f) { return (Number(f) / 1000).toFixed(3) + " BD"; }
  function site() { return location.origin + location.pathname.replace(/\/admin(\.html)?\/?$/, "").replace(/\/$/, ""); }
  function trackLink(o) { return site() + "/track.html?code=" + o.code; }
  function orderDate(o) { return new Date(o.created_at).toLocaleDateString("en-GB", { timeZone: "Asia/Bahrain", day: "numeric", month: "long", year: "numeric" }); }
  function items(o) { return o.order_items || []; }

  function itemLine(i, n) {
    return "  " + n + ". " + i.qty + " x " + i.name + " - " + bd(i.unit_price_fils * i.qty) +
      (i.preorder_qty ? " (" + i.preorder_qty + " of these not available in Bahrain, shipped from abroad)" : "");
  }
  function allItems(o) { return items(o).map(function (i, n) { return itemLine(i, n + 1); }).join("\n"); }
  function readyItems(o) { return items(o).filter(function (i) { return i.qty - i.preorder_qty > 0; }).map(function (i, n) { return "  " + (n + 1) + ". " + (i.qty - i.preorder_qty) + " x " + i.name; }).join("\n"); }
  function abroadItems(o) { return items(o).filter(function (i) { return i.preorder_qty > 0; }).map(function (i, n) { return "  " + (n + 1) + ". " + i.preorder_qty + " x " + i.name; }).join("\n"); }
  function totals(o) {
    var t = "Subtotal: " + bd(o.subtotal_fils) + "\n";
    if (o.discount_fils) t += "Discount" + (o.promo_code ? " (" + o.promo_code + ")" : "") + ": -" + bd(o.discount_fils) + "\n";
    t += "Delivery fee" + (o.delivery_block ? " (Block " + o.delivery_block + ")" : "") + ": " + (o.delivery_fee_fils ? bd(o.delivery_fee_fils) : "to be confirmed") + "\n";
    return t + "Total payable in cash on delivery: " + bd(o.total_fils);
  }
  function address(o) { return (o.area ? o.area + ", " : "") + (o.delivery_block ? "Block " + o.delivery_block + ", " : "") + o.address; }
  function head(o) { return "ORDER DETAILS\nOrder code: " + o.code + "\nOrder date: " + orderDate(o); }
  var CONTACT = "CONTACT\nFor any inquiry, or to arrange a birthday party order, please write to us at " + EMAIL + ".";
  var SIGN = "Yours faithfully,\nDetention Club";
  var CASH = "Payment is made in cash to our driver upon delivery. We kindly ask that you keep your phone available so that the driver may contact you.";

  function subject(o, kind) {
    if (kind === "preorder") return "Order Confirmation and Pre-order Notice - Detention Club (Order " + o.code + ")";
    if (kind === "delivery") return "Your Detention Club Order Will Arrive Today (Order " + o.code + ")";
    return "Order Confirmation - Detention Club (Order " + o.code + ")";
  }

  function text(o, kind) {
    var link = trackLink(o), dear = "Dear " + o.customer_name + ",\n\n";
    var tracking = "TRACKING\nYou may follow the progress of your order at any time using your order code:\n" + link;
    if (kind === "confirm") {
      return dear + "Thank you for choosing Detention Club. We are pleased to confirm that your order has been received and confirmed.\n\n" +
        head(o) + "\n\nItems ordered:\n" + allItems(o) + "\n\n" + totals(o) + "\n\n" +
        "DELIVERY\nDelivery address: " + address(o) + "\nYour order will reach you within 1 to 2 days. On the day of delivery, we will send you a further email to let you know that your order is on its way.\n" + CASH + "\n\n" +
        tracking + "\n\n" + CONTACT + "\n\n" + SIGN;
    }
    if (kind === "preorder") {
      var ready = readyItems(o);
      return dear + "Thank you for choosing Detention Club. We are pleased to confirm that your order has been received and confirmed.\n\n" +
        "Please note that one or more items in your order are not available in Bahrain at present. These items are shipped from abroad, which delays their delivery by 8 to 10 days.\n\n" +
        head(o) + "\n\n" + (ready ? "Items available now:\n" + ready + "\n\n" : "") +
        "Items shipped from abroad (not available in Bahrain, expected within 8 to 10 days):\n" + abroadItems(o) + "\n\n" + totals(o) + "\n\n" +
        "DELIVERY\nDelivery address: " + address(o) + "\n" + (ready ? "The items that are available now are prepared first, and you will receive a further email on the day of delivery. " : "") +
        "For the items shipped from abroad, we will email you as soon as they are ready to be delivered to you.\n" + CASH + "\n\n" +
        tracking + "\n\n" + CONTACT + "\n\n" + SIGN;
    }
    return dear + "We are pleased to inform you that your order is now on its way and will reach you through the day today.\n\n" +
      head(o) + "\n\nItems:\n" + allItems(o) + "\n\n" + totals(o) + "\n\n" +
      "DELIVERY\nDelivery address: " + address(o) + "\nAmount to be paid in cash to the driver: " + bd(o.total_fils) + "\nKindly keep your phone available so that the driver may contact you.\n\n" +
      tracking + "\n\nFEEDBACK\nOnce you have received your order, we would greatly appreciate your review. You may leave one on our website using the same link:\n" + link + "\n\n" + CONTACT + "\n\n" + SIGN;
  }
  function mailLink(o, kind) { return "mailto:" + encodeURIComponent(o.email) + "?subject=" + encodeURIComponent(subject(o, kind)) + "&body=" + encodeURIComponent(text(o, kind)); }
  function firstKind(o) { return o.has_preorder ? "preorder" : "confirm"; }

  function sampleOrder() {
    return { code: "DC-A1B2C3", customer_name: "Sara Ahmed", email: "sara@example.com", created_at: new Date().toISOString(), area: "Riffa", delivery_block: 929, address: "Building 12, Road 34",
      subtotal_fils: 2900, discount_fils: 290, promo_code: "SARA10", delivery_fee_fils: 1000, total_fils: 3610, has_preorder: false,
      order_items: [{ name: "Small Keychains", qty: 2, preorder_qty: 0, unit_price_fils: 200 }, { name: "Payment Star", qty: 1, preorder_qty: 0, unit_price_fils: 2000 }, { name: "Mini Colorful Rings", qty: 1, preorder_qty: 0, unit_price_fils: 300 }, { name: "Banana Squishies", qty: 1, preorder_qty: 0, unit_price_fils: 700 }] };
  }
  function samplePre() {
    var s = sampleOrder(); s.has_preorder = true; s.order_items[1].preorder_qty = 1; return s;
  }

  /* ---------- Claude Cowork prompts ---------- */
  function itemsText(o) { return items(o).map(function (i) { return i.qty + " x " + i.name; }).join(", "); }

  function prompt1(orders) {
    var list = orders.filter(function (o) { return o.status === "preparing" && !o.confirm_emailed_at; });
    if (!list.length) return "There are no confirmed orders waiting for a confirmation email right now.";
    var t = "You are helping me run Detention Club, a student-run toy store in Bahrain.\n\nTASK: Send the " + list.length + " confirmation email(s) below, from the Gmail account " + EMAIL + ".\n\n" +
      "RULES\n1. First show me a short table of every email you are about to send (order code, customer name, email address, subject). Then wait for me to reply \"go\".\n" +
      "2. After I reply \"go\", send every email without asking again. Use the exact subject and body provided. Do not change any amount, name or address.\n" +
      "3. If something is missing or looks wrong (for example an email address that is empty or invalid), skip that order and tell me at the end.\n" +
      "4. Do not send anything other than the emails below.\n\n";
    list.forEach(function (o, n) {
      t += "======== EMAIL " + (n + 1) + " OF " + list.length + " ========\nOrder code: " + o.code + "\nTo: " + o.email + "\nSubject: " + subject(o, firstKind(o)) + "\nBody:\n" + text(o, firstKind(o)) + "\n\n";
    });
    return t + "When finished, give me a summary listing each order code and whether its email was sent.";
  }

  function prompt2(orders) {
    var list = orders.filter(function (o) { return o.status === "ready"; });
    if (!list.length) return "There are no orders confirmed for delivery right now.";
    var t = "You are helping me run Detention Club, a student-run toy store in Bahrain.\n\nThere are " + list.length + " order(s) confirmed for delivery today. Do TASK A first, and TASK B only after TASK A is completely finished.\n\n" +
      "TASK A - PARCEL APP (on this laptop)\nFor each order below, open the Parcel app and book a driver. Enter ONLY: the items price, the customer's phone number, the customer's location (area, block and address), and the cash to collect. Never enter any payment details.\n\n" +
      "TASK B - DELIVERY EMAILS (Gmail account " + EMAIL + ")\nWhen you have finished booking ALL the drivers in Parcel, open Gmail and send each customer the delivery-day email provided for their order. Do not send an email for any order whose driver was not booked.\n\n" +
      "RULES\n1. First show me a short table of what you will do: order code, customer, phone, location, items price, cash to collect, and the customer's email address. Then wait for me to reply \"go\".\n" +
      "2. After I reply \"go\", complete Task A for every order, then Task B, without asking again.\n" +
      "3. If Parcel shows an error, an unexpected price, or a field you cannot fill, stop that order, skip its email, and tell me at the end.\n" +
      "4. Use the exact subject and body provided for each email. Do not change any amount, name or address.\n\n";
    list.forEach(function (o, n) {
      t += "======== ORDER " + (n + 1) + " OF " + list.length + " ========\nOrder code: " + o.code + "\nCustomer: " + o.customer_name + "\nPhone: " + o.phone + "\nLocation: " + address(o) + (o.notes ? "\nNotes for the driver: " + o.notes : "") +
        "\nItems: " + itemsText(o) + "\nItems price (enter in Parcel): " + bd(o.subtotal_fils - o.discount_fils) + "\nCash to collect from the customer: " + bd(o.total_fils) +
        "\n\nDELIVERY EMAIL (send in Task B)\nTo: " + o.email + "\nSubject: " + subject(o, "delivery") + "\nBody:\n" + text(o, "delivery") + "\n\n";
    });
    return t + "When finished, give me a summary listing each order code: whether the driver was booked and whether the email was sent.";
  }

  function promptBlocks(blocks, home) {
    return "You are helping me run Detention Club, a student-run toy store in Bahrain. Delivery prices must be collected from the Parcel app.\n\n" +
      "TASK\nOpen the Parcel app on this laptop and find out how much a delivery costs from my home to each of these Bahrain block numbers:\n" + (blocks || "[PUT THE BLOCK NUMBERS HERE]") + "\n\n" +
      "My home (pick-up) address: " + (home || "[PUT MY HOME ADDRESS HERE]") + "\n\n" +
      "RULES\n1. For each block, start a new delivery in Parcel from my home to that block, read the delivery price, and write it down. This is a price check only. NEVER confirm, pay for or book a delivery. Cancel or close each quote.\n" +
      "2. Keep going until every block is done. If a block gives no price, write it down as MISSING and move on.\n" +
      "3. Collect the results as one line per block in exactly this format (block, price in BD):\n929, 1.200\n932, 1.500\n" +
      "4. When all blocks are done, open the Detention Club admin page: " + site() + "/admin.html (I will log in for you if needed), go to the Delivery fees tab, paste your lines into the \"Import prices\" box and press Import. Then tell me how many blocks were imported and list any MISSING blocks.";
  }

  window.DCEmails = { EMAIL: EMAIL, subject: subject, text: text, mailLink: mailLink, firstKind: firstKind, sampleOrder: sampleOrder, samplePre: samplePre,
    prompt1: prompt1, prompt2: prompt2, promptBlocks: promptBlocks, address: address, itemsText: itemsText };
})();
