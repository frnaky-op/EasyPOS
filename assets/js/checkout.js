const { parsePaymentAmount, paymentChange } = require('./payment-amount');

$(document).ready(function () {
  const paymentFormat = amount => Number(amount).toFixed(2).replace('.', ',');

  function setPaymentAmount(raw) {
    const amount = parsePaymentAmount(raw);
    const value = Number.isFinite(amount) ? amount.toFixed(2) : '';
    $('#payment').val(value);
    $('#paymentText').val(value ? paymentFormat(amount) : '');
    $(document).calculateChange();
  }

  $.fn.calculateChange = function () {
    const result = paymentChange($('#payablePrice').val(), $('#payment').val());
    const isCard = $('#card').hasClass('active');
    const due = parsePaymentAmount($('#payablePrice').val());
    const received = parsePaymentAmount($('#payment').val());
    const valid = result.valid && (!isCard || Math.round(received * 100) === Math.round(due * 100));
    const change = isCard ? 0 : result.change;
    $('#change').text(paymentFormat(change)).data('raw', change);
    $('#confirmPayment').prop('disabled', !valid).toggle(valid);
  };

  $.fn.keypadBtnPressed = function (value, isDueInput) {
    if (isDueInput) {
      $('#refNumber').val((_, current) => current + String(value));
      return;
    }
    const current = String($('#payment').val() || '');
    if (value === '.' && current.includes('.')) return;
    const next = current + String(value);
    if (!/^\d*(?:\.\d{0,2})?$/.test(next)) return;
    $('#payment').val(next);
    $('#paymentText').val(next.replace('.', ','));
    $(document).calculateChange();
  };

  $.fn.digits = function () { $(this).keypadBtnPressed('.', false); };

  $('.keypad-btn').on('click', function () {
    const key = String($(this).data('val'));
    const isDue = $(this).data('isdue') === true;
    if (key === 'del') {
      if (isDue) $('#refNumber').val((_, current) => current.slice(0, -1));
      else {
        const next = String($('#payment').val() || '').slice(0, -1);
        $('#payment').val(next);
        $('#paymentText').val(next.replace('.', ','));
        $(document).calculateChange();
      }
    } else if (key === 'ac') {
      if (isDue) $('#refNumber').val('');
      else setPaymentAmount('');
    } else {
      $(this).keypadBtnPressed(key, isDue);
    }
  });

  $('#paymentText').on('input', function () {
    const amount = parsePaymentAmount(this.value);
    $('#payment').val(Number.isFinite(amount) ? amount.toFixed(2) : '');
    $(document).calculateChange();
  }).on('keydown', function (event) {
    if (event.key === 'Enter' && !$('#confirmPayment').prop('disabled')) {
      event.preventDefault();
      $('#confirmPayment').trigger('click');
    }
  });

  $('.payment-quick').on('click', function () {
    const value = $(this).data('amount');
    setPaymentAmount(value === 'exact' ? $('#payablePrice').val() : value);
    $('#paymentText').trigger('focus');
  });

  $('#paymentModel .list-group-item').on('click', function () {
    $('#paymentModel .list-group-item').removeClass('active');
    $(this).addClass('active');
    const isCard = this.id === 'card';
    $('#cardInfo').toggle(isCard);
    $('#paymentMethodHint').text(isCard
      ? 'Le montant par carte doit correspondre exactement au total à payer.'
      : 'Saisir le montant reçu pour calculer la monnaie à rendre.');
    if (isCard) setPaymentAmount($('#payablePrice').val());
    else $(document).calculateChange();
  });

  $('#paymentModel').on('show.bs.modal', function () {
    $('#paymentModel .list-group-item').removeClass('active');
    $('#cash').addClass('active');
    $('#cardInfo').hide();
    $('#paymentInfo').val('');
    $('#paymentMethodHint').text('Saisir le montant reçu pour calculer la monnaie à rendre.');
    setPaymentAmount('');
  }).on('shown.bs.modal', function () { $('#paymentText').trigger('focus'); });
});
