function ShowMessage(error, success) {
    if (error != '') {
        GenerateErrorMessage(error);
    }
    removeloadingGif();
}

function ShowUnknownErrorMessage() {
    var errorMessage = 'İşlem sırasında beklenmeyen bir hata oluştu...';
    GenerateErrorMessage(errorMessage);
}
function GenerateErrorMessage(message) {

    $(".errorFormMessage").text(message);
    $(".errorFormMessage").show();

}
function RemoveErrorMessage(className) {
    if (className == undefined || className == null || className == '') {
        className = "errorFormMessage";
    }
    $("." + className).text("");
    $("." + className).hide();
}


function LoadingShowContainer(refrehDiv) {

    $('.loading-bg').show();
    $('body').addClass('body-loading');

    return false;
}

function LoadingHideContainer(refrehDiv) {
    $('.loading-bg').hide();
    $('body').removeClass('body-loading');
}

function CheckEmail(email) {
    var regex = /^([a-zA-Z0-9_.+-])+\@(([a-zA-Z0-9-])+\.)+([a-zA-Z0-9]{2,4})+$/;
    return regex.test(email);
}

function MakeAjaxCall(controllerName, action, data, type, isASync, onSuccessCallback, onErrorCallback, onBeginCallback, onCompleteCallback) {

    var url = '/' + controllerName + '/' + action;
    MakeAjaxCallUrl(url, data, type, isASync, onSuccessCallback, onErrorCallback, onBeginCallback, onCompleteCallback);
}

function MakeAjaxCallUrl(url, data, type, isASync, onSuccessCallback, onErrorCallback, onBeginCallback, onCompleteCallback) {
    onSuccessCallback = typeof onSuccessCallback !== 'undefined' ? onSuccessCallback : null;
    onErrorCallback = typeof onErrorCallback !== 'undefined' ? onErrorCallback : null;
    onBeginCallback = typeof onBeginCallback !== 'undefined' ? onBeginCallback : null;
    onCompleteCallback = typeof onCompleteCallback !== 'undefined' ? onCompleteCallback : null;

    $.ajax({
        url: url,
        type: type,
        async: isASync,
        data: data,
        beforeSend: function () {
            //LoadingShowContainer();
            if (onBeginCallback !== null) {
                onBeginCallback();
            }
        },
        success: function (response) {
            if (onSuccessCallback !== null) {
                onSuccessCallback(response);
            }
        },
        error: function () {
            if (onErrorCallback !== null) {
                onErrorCallback(data);
            } else {
                //ShowUnknownErrorMessage();
            }

        },
        complete: function () {
            if (onCompleteCallback !== null) {
                onCompleteCallback();
            }
            //LoadingHideContainer();
        }

    });
}

function MakeAjaxCallForAdres(controllerName, action, data, type, isASync, onSuccessCallback, onErrorCallback, reloadElementId, clearElementClass, onBeginCallback, onCompleteCallback) {
    onSuccessCallback = typeof onSuccessCallback !== 'undefined' ? onSuccessCallback : null;
    onErrorCallback = typeof onErrorCallback !== 'undefined' ? onErrorCallback : null;
    onBeginCallback = typeof onBeginCallback !== 'undefined' ? onBeginCallback : null;
    onCompleteCallback = typeof onCompleteCallback !== 'undefined' ? onCompleteCallback : null;

    var url = '/' + controllerName + '/' + action;
    $.ajax({
        url: url,
        type: type,
        async: isASync,
        data: data,
        beforeSend: function () {
            //LoadingShowContainer();
            if (onBeginCallback !== null) {
                onBeginCallback();
            }
        },
        success: function (response) {
            if (onSuccessCallback !== null) {
                onSuccessCallback(response, reloadElementId, clearElementClass);
            }
        },
        error: function () {
            if (onErrorCallback !== null) {
                onErrorCallback(data);
            } else {
                //ShowUnknownErrorMessage();
            }

        },
        complete: function () {
            if (onCompleteCallback !== null) {
                onCompleteCallback();
            }
            //LoadingHideContainer();
        }

    });
}

function isNullOrWhitespace(input) {

    if (typeof input === 'undefined' || input == null) return true;

    return input.replace(/\s/g, '').length < 1;
}

function loadingGif() {

    $('.loading-bg').show();
    $('body').addClass('body-loading');
}
function removeloadingGif() {
    $('.loading-bg').hide();
    $('body').removeClass('body-loading');
}

function formOnlineIslemBaseFailure() {
    ShowUnknownErrorMessage();
}
function formOnlineIslemBaseComplete() {
    removeloadingGif();
}
function GetIller(kurumKodu, reloadElementId) {
    MakeAjaxCallForAdres("adres", "iller?kurumKodu=" + kurumKodu, null, "GET", false, GetIllerSuccess, error, reloadElementId)
}

function GetIllerSuccess(res, reloadElementId) {

    //setTimeout(function () {
    //    $(".IlChangeSelector").each(function () {
    //        var elementId = $(this).attr("id");
    //        $("#" + elementId).html("");
    //        $("#" + elementId).selectpicker('refresh');
    //    });
    //}, 2500);


    var val = res.result.ilListe;
    var content = "";
    content += "<option value='' selected disabled data-subtext='İl'> İl </option>";
    for (var i = 0; i < val.length; i++) {

        content += "<option value='" + val[i].ilKodu + "' data-subtext='İl'>" + val[i].ilAdi + "</option>";
    }
    $("#" + reloadElementId).html(content).selectpicker('refresh');
}

function GetIlceler(ilKodu, reloadElementId, clearElementClass) {
    MakeAjaxCallForAdres("adres", "ilceler?ilKodu=" + ilKodu, null, "GET", false, GetIlcelerSuccess, error, reloadElementId, clearElementClass)
}

function GetIlcelerSuccess(res, reloadElementId, clearElementClass) {

    $("." + clearElementClass).each(function () {
        var elementId = $(this).attr("id");
        $("#" + elementId).html("");
        $("#" + elementId).selectpicker('refresh');
    });

    var val = res.result.ilceListe;
    var content = "";
    content += "<option value='' selected disabled data-subtext='İlçe'> İlçe </option>";
    for (var i = 0; i < val.length; i++) {
        content += "<option data-subtext='İlçe' value='" + val[i].ilceKodu + "'>" + val[i].ilceAdi + "</option>";
    }
    $("#" + reloadElementId).html(content).selectpicker('refresh');
}

function GetBucaklar(ilKodu, ilceKodu, reloadElementId, clearElementClass) {
    MakeAjaxCallForAdres("adres", "bucaklar?ilKodu=" + ilKodu + "&ilceKodu=" + ilceKodu, null, "GET", false, GetBucaklarSuccess, error, reloadElementId, clearElementClass)
}

function GetBucaklarSuccess(res, reloadElementId, clearElementClass) {

    $("." + clearElementClass).each(function () {
        var elementId = $(this).attr("id");
        $("#" + elementId).html("");
        $("#" + elementId).selectpicker('refresh');
    });
    var val = res.result.bucakListe;
    var content = "";
    content += "<option value='' selected disabled data-subtext='Bucak'> Bucak </option>";
    for (var i = 0; i < val.length; i++) {
        content += "<option data-subtext='Bucak' value='" + val[i].bucakKodu + "'>" + val[i].bucakAdi + "</option>";
    }
    $("#" + reloadElementId).html(content).selectpicker('refresh');
}

function GetBeldeler(ilKodu, ilceKodu, bucakKodu, reloadElementId, clearElementClass) {
    MakeAjaxCallForAdres("adres", "beldeler?ilKodu=" + ilKodu + "&ilceKodu=" + ilceKodu + "&bucakKodu=" + bucakKodu, null, "GET", false, GetBeldelerSuccess, error, reloadElementId, clearElementClass)
}

function GetBeldelerSuccess(res, reloadElementId, clearElementClass) {

    $("." + clearElementClass).each(function () {
        var elementId = $(this).attr("id");
        $("#" + elementId).html("");
        $("#" + elementId).selectpicker('refresh');
    });

    var val = res.result.beldeKoyListe;
    var content = "";
    content += "<option value='' data-subtext='Belde'  selected disabled data-subtext='Belde'> Belde </option>";
    for (var i = 0; i < val.length; i++) {
        content += "<option data-subtext='Belde' value='" + val[i].beldeKoyKodu + "'>" + val[i].beldeKoyAdi + "</option>";
    }
    $("#" + reloadElementId + "> option:eq(1)").data("subtext", "Belde");
    $("#" + reloadElementId).html(content).selectpicker('refresh');
}

function GetMahalleler(ilKodu, ilceKodu, bucakKodu, beldeKodu, reloadElementId, clearElementClass) {
    MakeAjaxCallForAdres("adres", "mahalleler?ilKodu=" + ilKodu + "&ilceKodu=" + ilceKodu + "&bucakKodu=" + bucakKodu + "&beldeKoyKodu=" + beldeKodu, null, "GET", false, GetMahallelerSuccess, error, reloadElementId, clearElementClass)
}

function GetMahallelerSuccess(res, reloadElementId, clearElementClass) {

    $("." + clearElementClass).each(function () {
        var elementId = $(this).attr("id");
        $("#" + elementId).html("");
        $("#" + elementId).selectpicker('refresh');
    });

    var val = res.result.mahalleListe;
    var content = "";
    content += "<option  value='' selected disabled data-subtext='Mahalle'> Mahalle </option>";
    for (var i = 0; i < val.length; i++) {
        content += "<option data-subtext='Mahalle' value='" + val[i].mahalleKodu + "'>" + val[i].mahalleAdi + "</option>";
    }
    $("#" + reloadElementId).html(content).selectpicker('refresh');
}

function GetSokaklar(ilKodu, ilceKodu, bucakKodu, beldeKodu, mahalleKodu, reloadElementId, clearElementClass) {
    MakeAjaxCallForAdres("adres", "sokaklar?ilKodu=" + ilKodu + "&ilceKodu=" + ilceKodu + "&bucakKodu=" + bucakKodu + "&beldeKoyKodu=" + beldeKodu + "&mahalleKodu=" + mahalleKodu, null, "GET", false, GetSokaklarSuccess, error, reloadElementId, clearElementClass)
}

function GetSokaklarSuccess(res, reloadElementId, clearElementClass) {

    var val = res.result.sokakListe;
    var content = "";
    content += "<option data-subtext='Sokak' value='' selected disabled data-subtext='Sokak'> Sokak </option>";
    for (var i = 0; i < val.length; i++) {
        content += "<option data-subtext='Sokak' value='" + val[i].sokakKodu + "'>" + val[i].sokakAdi + "</option>";
    }
    if (val.length > 599) {//Koray - listede 599'dan fazla item olursa son item görünmüyordu. Normal yollardan çözemedik. Fikir sahibi Salih İpek'e sevgilerle
        content += "<option data-subtext='Sokak' value=''></option>";
    }
    $("#" + reloadElementId).html(content).selectpicker('refresh');
}
// Konumdan adres bulma fonksiyonlari

function KonumunuKullanClick() {
    if (navigator.geolocation) {
        loadingGif();
        navigator.geolocation.getCurrentPosition(KonumdanAdresBul, showError);
    } else {
        ShowMessage("Tarayıcınız konum verisini desteklememektedir.");
    }
}
function KonumdanAdresBul(position) {
    
    var obj = {
        Kurum: '',
        Enlem: position.coords.latitude,
        Boylam: position.coords.longitude
    };
    setTimeout(function () {
        MakeAjaxCall("Adres", "KonumdanAdresBul", obj, "POST", false, function (res) {
            if (res.state == 1) {
                AdresVerileriniYukle(res, false);
            }
            else {
                ShowMessage(res.message);
            }
        }, function (err) {
            ShowUnknownErrorMessage();
            console.log(err);
        }, loadingGif, removeloadingGif);
    }, 5);

   
}
function showError(error) {
    switch (error.code) {
        case error.PERMISSION_DENIED:
            ShowMessage("Gerekli izin alınamadı.");
            break;
        case error.POSITION_UNAVAILABLE:
            ShowMessage("Konum bilgisi bulunamadı.");
            break;
        case error.TIMEOUT:
            ShowMessage("İstek zaman aşımına uğradı.");
            break;
        case error.UNKNOWN_ERROR:
            ShowMessage("Bir hata oluştu.");
            break;
    }
}
function IlSet(res) {
    $('#IlKodu').selectpicker('val', res.data.ilKodu);
    $("#IlKodu").trigger("change");
    return true;
}
function IlceSet(res) {
    $('#IlceKodu').selectpicker('val', res.data.ilceKodu);
    $("#IlceKodu").trigger("change");
    return true;
}
function BucakSet(res) {
    $('#BucakKodu').selectpicker('val', res.data.bucakKodu);
    $("#BucakKodu").trigger("change");
    return true;
}
function BeldeSet(res) {
    $('#BeldeKoyKodu').selectpicker('val', res.data.beldeKoyKodu);
    $("#BeldeKoyKodu").trigger("change");
    return true;
}
function MahalleSet(res) {
    $('#MahalleKodu').selectpicker('val', res.data.mahalleKodu);
    $("#MahalleKodu").trigger("change");
    return true;
}
function CaddeSet(res) {
    $('#CaddeSokakKodu').selectpicker('val', res.data.sokakKodu);
    return true;
}
function AdresVerileriniYukle(res, sorgula) {
    loadingGif();
    setTimeout(function () {
        $.when(IlSet(res)).done(function () {
            $.when(IlceSet(res)).done(function () {
                $.when(BucakSet(res)).done(function () {
                    $.when(BeldeSet(res)).done(function () {
                        $.when(MahalleSet(res)).done(function () {
                            $.when(CaddeSet(res)).done(function () {
                                removeloadingGif();
                                if (sorgula) {
                                    $("#elektrikKesintiSorgulaBtn").trigger("click");
                                }
                            });
                        });
                    });
                });
            });
        });

    }, 1);
}

function setWithExpiry2(key, value, ttl = 3600000) {
    const now = new Date()
    var item = {
        value: value,
        expiry: now.getTime() + ttl,
        fId: key
    }

    var formKontrolValueList = JSON.parse(localStorage.getItem('formKontrolValueList') || "[]");

    if (formKontrolValueList == null) {
        formKontrolValueList = [item];
    } else {
        let formKontrolItem = formKontrolValueList.find(x => x.fId === key);
        if (formKontrolItem == null) {
            formKontrolValueList.push(item);
        } else {
            var foundIndex = formKontrolValueList.findIndex(x => x.fId == key);
            formKontrolValueList[foundIndex] = item;
        }
    }
    localStorage.setItem('formKontrolValueList', JSON.stringify(formKontrolValueList));
}
function getWithExpiry2(key) {
    var formKontrolValueList = JSON.parse(localStorage.getItem('formKontrolValueList'));
    var item = null;
    if (formKontrolValueList != null)
        item = formKontrolValueList.find(x => x.fId === key);
    if (!item) {
        return 0;
    }
    const now = new Date()
    // compare the expiry time of the item with the current time
    if (now.getTime() > item.expiry) {
        formKontrolValueList = $.grep(formKontrolValueList, function (e) {
            return e.fId != key;
        });

        localStorage.setItem('formKontrolValueList', JSON.stringify(formKontrolValueList));
        return 0;
    }
    return item.value;
}
function CaptchaShowHide(formId) {
    $("." + formId).show();
}
function CaptchaValueCheck(widgetId, formId) {

    if (widgetId != null && widgetId != undefined) {
        if ($("." + formId).css("display") !== "none") {
            if (grecaptcha.getResponse(widgetId) === undefined || grecaptcha.getResponse(widgetId) === "")
                return false;
            return true;
        } else {
            return true;

        }
    }
    else {
        var res = $(".g-recaptcha").css("display");
        if (res !== undefined && res !== "none") {
            if ($("#g-recaptcha-response").val() === undefined || $("#g-recaptcha-response").val() === "")
                return false;
            return true;
        }
        else {
            return true;
        }
    }

    
}
function SetCaptchaValue(formId) {
    return;
}

function AddValidationError(elementId, message) {
    var item = $("[data-valmsg-for=" + elementId + "]");
    item.removeClass("field-validation-valid");
    item.addClass("field-validation-error");
    item.text(message);
}
function RemoveValidationError(elementId) {
    var item = $("[data-valmsg-for=" + elementId + "]");

    if (item.hasClass("field-validation-error")) {
        item.removeClass("field-validation-error");
        item.addClass("field-validation-valid");
        item.text("");
    }
}
function RemoveAllValidationError() {
    $(".field-validation-error").each(function (index, item) {

        if ($(this).hasClass("field-validation-error")) {
            $(this).removeClass("field-validation-error");
            $(this).addClass("field-validation-valid");
            $(this).text("");
        }

    });
}
function ClientSideFluentValidation(response, elementId, submitButtonId,) {

    if (response.state == 1) {
        RemoveValidationError(elementId);
        $("#" + submitButtonId).removeClass("disabled");
    }
    else if (response.state == 2) {
        var elementValid = true;
        $.each(response.data, function (index, element) {
            if (elementId == element.fieldName) {
                elementValid = false;
                AddValidationError(element.fieldName, element.message);
            }
        });
        if (elementValid) {
            RemoveValidationError(elementId);
        }
    }
    else {
        ShowMessage(response.message);
    }
}

function error() {}