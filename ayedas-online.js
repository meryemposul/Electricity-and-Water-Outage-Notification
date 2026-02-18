// search input - autocomplete
$('.search-input--autocomplete input').on("keyup", function (e) {
    let ths = $(this);
    $(ths).dropdown('toggle');
    if ($(window).width() < 1000) {
        $('body').addClass('body-overflow-hidden');
    }
    if ($(ths).val().replace(/\s+/g, '').length >= 3) {

        textBold($(this).val(), '.search-input--autocomplete ul li a');
        $('.search-input--autocomplete .input-text').html($(ths).val());
        $('.oneri-text').hide();
        $('.s-body').show();
    } else {
        $('.oneri-text').show();
        $('.s-body').hide();
    }

    //btn add active class 
    if ($(ths).val().replace(/\s+/g, '').length >= 1) {
        $('.btn-search-input').addClass('active');
    } else {
        $('.btn-search-input').removeClass('active');
    }

});
$('.search-input--autocomplete .close, .search-input--default .close ').click(function () {
    autocompleteClear($(this));
    setTimeout(function () {
        $('.search-input-focus').removeClass('active');
        $('.search-input input').val('');
        $('.search-input--autocomplete input, .search-input--default input').dropdown('hide');
        $('body').removeClass('body-overflow-hidden');
    }, 50);

});


function autocompleteClear(ths) {
    $(ths).closest('.search-input--autocomplete').find('input').val('');
    $(ths).closest('.search-input--autocomplete').find('input')[0].setAttribute("data-value", '');
    textBold('', '.search-input--autocomplete ul li a');
    $('.btn-search-input').removeClass('active');
}
$('.search-input--autocomplete .clear').click(function (e) {
    autocompleteClear($(this));
    $('.search-input--autocomplete .input-text').html('');
});

//Arama Sayfası AutoComplete
$('.search-input--autocompleteArama input').on("keyup", function (e) {
    let ths = $(this);
    $(ths).dropdown('toggle');
    if ($(window).width() < 1000) {
        $('body').addClass('body-overflow-hidden');
    }
    if ($(ths).val().replace(/\s+/g, '').length >= 3) {

        textBold($(this).val(), '.search-input--autocompleteArama ul li a');
        $('.search-input--autocompleteArama .input-text').html($(ths).val());
        $('.oneri-text').hide();
        $('.s-bodyArama').show();
    } else {
        $('.oneri-text').show();
        $('.s-bodyArama').hide();
    }

    //btn add active class 
    if ($(ths).val().replace(/\s+/g, '').length >= 1) {
        $('.btn-search-input').addClass('active');
    } else {
        $('.btn-search-input').removeClass('active');
    }

});
$('.search-input--autocompleteArama .close').click(function () {
    $('.search-input--autocompleteArama input').dropdown('hide');
    autocompleteAramaClear($(this));
    $('body').removeClass('body-overflow-hidden');
});


function autocompleteAramaClear(ths) {
    $(ths).closest('.search-input--autocompleteArama').find('input').val('');
    $(ths).closest('.search-input--autocompleteArama').find('input')[0].setAttribute("data-value", '');
    textBold('', '.search-input--autocompleteArama ul li a');
    $('.btn-search-input').removeClass('active');
}
$('.search-input--autocompleteArama .clear').click(function (e) {
    autocompleteAramaClear($(this));
    $('.search-input--autocompleteArama .input-text').html('');
});

function textBold(text, content) {
    $.fn.wrapInTag = function (opts) {
        var tag = 'strong',
            words = opts.words || [],
            regex = RegExp(words.join('|'), 'gi'),
            replacement = '<' + tag + '>$&</' + tag + '>';

        return this.html(function () {
            return $(this).text().replace(regex, replacement);
        });
    };

    $(content).wrapInTag({
        tag: 'em',
        words: [text]
    });
}

//tooltip
$('[data-toggle="tooltip"]').tooltip();
$('[data-toggle="popover"]').popover();

//tab show 
$(".ul-search-filter a[data-url], .detay-link a[data-url]").click(function () {
    let ths = $(this);
    let page = ths.data('url');
    $(this).closest('.ul-search-filter').find('a').removeClass('active');
    ths.addClass('active');
    if (page == 'all') {
        $('.page_content-hide').show();
    } else {
        $('.page_content-hide').hide();
        $('.' + page).show();
    }
});


// menu height calc
function contentHeight() {
    var winH = $('html').outerHeight(),
        width = $('html').outerWidth(),
        headerHei = $(".header").outerHeight(),
        contentHei = winH - headerHei;
    if (width > 700) {
        $(".hp_menu").css("min-height", contentHei);
        $('head').append('<style>.hp_menu::before{min-height:' + contentHei + "px" + '}</style>');
    } else {
        $(".hp_menu").css("min-height", $(window).outerHeight() - 130);
    }
}
$(document).ready(function () {
    contentHeight();
});
$(window).resize(function () {
    contentHeight();
});


//native dropdown show
$('.native-dropdown button').click(function (e) {
    $('body').addClass('overflow-hidden');
    $('.native-box').show();
});
$('.native-box .vazgec,  .native-box ul li a').click(function (e) {
    $('body').removeClass('overflow-hidden');
    $('.native-box').hide();
});

/* sticky */
$(function () {
    var navbar = $('.homepage-header,.header,.header-mobile');
    if ($(window).width() > 1000) {
        $(window).scroll(function () {
            if ($(window).scrollTop() <= 35) {
                navbar.removeClass('header-scroll');
                $('body > .container').css('padding-top', '0');
            } else {
                $('body > .container').css('padding-top', '70px');
                navbar.addClass('header-scroll');

            }
        });
    }
});


/*memnuniyet anketi button active class*/
$('.btn-memnuniyet-anketi').click(function () {
    $(this).addClass('active');
});
$('#modal-memnuniyet-anketi').on('hidden.bs.modal', function () {
    $('.btn-memnuniyet-anketi').removeClass('active');
});


/*memnuniyet anketi step*/
$('#modal-memnuniyet-anketi .step-content .next-button').click(function () {
    if (!$(this).hasClass('disabled')) {
        let ths = $(this);
        let step = ths.data('step');
        nextStep(step);
    }
});
$('#modal-memnuniyet-anketi .step-bar').on('click', '.filled', function () {
    let ths = $(this).find('a');
    let next = ths.data('step');
    nextStep(next - 1);
});
function nextStep(step) {
    $('#modal-memnuniyet-anketi .step-content .item').hide();
    $('#modal-memnuniyet-anketi .step-content .item').eq(step).show();
    $('#modal-memnuniyet-anketi .step-bar .active').addClass('filled');
    $('#modal-memnuniyet-anketi .step-bar .active').removeClass('active');
    $('#modal-memnuniyet-anketi .step-bar li').eq(step).addClass('active');
}

/*memnuniyet anketi step*/
$('#modal-basvuru-memnuniyet-anketi .step-content .next-button').click(function () {
    if (!$(this).hasClass('disabled')) {
        let ths = $(this);
        let step = ths.data('step');
        nextStepBasvuru(step);
    }
});
$('#modal-basvuru-memnuniyet-anketi .step-bar').on('click', '.filled', function () {
    let ths = $(this).find('a');
    let next = ths.data('step');
    nextStepBasvuru(next - 1);
});
function nextStepBasvuru(step) {
    $('#modal-basvuru-memnuniyet-anketi .step-content .item').hide();
    $('#modal-basvuru-memnuniyet-anketi .step-content .item').eq(step).show();
    $('#modal-basvuru-memnuniyet-anketi .step-bar .active').addClass('filled');
    $('#modal-basvuru-memnuniyet-anketi .step-bar .active').removeClass('active');
    $('#modal-basvuru-memnuniyet-anketi .step-bar li').eq(step).addClass('active');
}

$('.survey li a').click(function () {
    $(this).closest('.survey').find('a').removeClass('active');

    $(this).closest('.survey').find('a img').map(function () {
        $(this).attr('src', $(this).data('img'));
    })
    $(this).addClass('active');
    $(this).find('img').attr('src', $(this).find('img').data('imghover'));
    $(this).closest('.item').find('.next-button').removeClass('disabled');
});
$('.step-content .item .input-checkbox input').change(function () {
    if ($('.step-content .item .input-checkbox input').is(":checked")) {
        $(this).closest('.item').find('.next-button').removeClass('disabled');
    } else {
        $(this).closest('.item').find('.next-button').addClass('disabled');
    }
});




//modal firefox
if ($(window).width() < 700) {
    $('.modal-dialog, .modal-content').css('width', $(window).width() - 15);
}
//SSS page content show
$(".menu-left a[data-url]").click(function () {
    let ths = $(this);
    let page = ths.data('url');
    $('.menu-left .active').removeClass('active')
    ths.addClass('active');
    $('.page_content-hide').hide();
    $('.' + page).show();
});
//SSS page content show
$(".menu-left--mobile a[data-url]").click(function () {
    let ths = $(this);
    let page = ths.data('url');
    $('.menu-left--mobile .active').removeClass('active')
    ths.addClass('active');
    $('.page_content-hide').hide();
    $('.' + page).show();
});

//fileInput
function fileInputImageShow(input) {

    $(input).closest('.file-input').find('.img-show').show();
    $(input).closest('.file-input').find('.img-button').hide();
    if (input.files[0].type == "application/pdf") {
        $(input).closest('.file-input').find('.preview').attr('src', '/EnerjisaTema/img/pdf-icon.png');
        $(input).closest('.file-input').find('.show-file').show();
    }
    else{
        var reader = new FileReader();
        reader.onload = function (e) {
            $(input).closest('.file-input').find('.preview').attr('src', e.target.result);
        }
        reader.readAsDataURL(input.files[0]); // convert to base64 string
    }
}

//$(document.body).on("change", ".file-input input[type=\"file\"]", function (e) {
//    e.preventDefault();
//    var fileId = $(this).attr("name");
//    // Allowing file type
//    var allowedExtensions =
//        /(\.jpg|\.png|\.tiff)$/i;

//    if (!allowedExtensions.exec($(this).val()) || ($(this)[0].files[0].size / 1024 / 1024) > 3.0) {
//        $("#" + fileId + "Error").show().html("Lütfen dokümanı uygun formatta ve 3MB'ı geçmeyecek şekilde yükleyiniz (jpg, png ya da tiff).");
//        e.preventDefault();
//        $("." + fileId + "Kaldir").click();
//    } else {
//        $("#" + fileId + "Error").hide().html("");
//        fileInputImageShow(this);
//    }
//});
$('.file-input .img-button').on('click', function (e) {
    e.preventDefault();
    $(this).closest('.file-input').find('input[type="file"]').trigger('click');
});
$('.file-input .remove').on("click", function () {
    $(this).closest('.file-input').find('.img-show').hide();
    $(this).closest('.file-input').find('.img-button').show();
    $(this).closest('.file-input').find('input[type="file"]').val('');
});
//önemli bilgilendirme close buton
$('.onemli_bilgilendirme .close').click(function () {
    $(this.parentElement).hide();
    $('body').removeClass('body-onemli_bilgilendirme');
});

//yetkili elektrikci listesi mobile filter
$('.button-filtrele').click(function () {
    $('.filter-box-left').show();
    if ($(window).width() < 1000) {
        $('body').css('overflow-y', 'hidden');
    }
});
$('.filter-box-left .close').click(function () {
    $('.filter-box-left').hide();
    if ($(window).width() < 1000) {
        $('body').css('overflow-y', 'auto');
    }
});

function ClickEnglish() {
    $("#dil-degisimi").modal("show");
}

//Arama

//Statik Liste
var fuseStaticlist;
///SSS Listesi
var fuseSssList;

///SSS Listesi
var ajaxSssList;

ajaxSssList = $.ajax({
    type: "GET",
    url: "/all-sss",
    async: true,
    success: function (res) {
        fuseSssList = new Fuse(res, options2);
    },
    error: function (err) {
    }
});

const options = {
    includeMatches: true,
    threshold: 0.2,
    ignoreLocation: true,
    keys: ['name', 'keywords']
}
const options2 = {
    includeMatches: true,
    threshold: 0,
    ignoreLocation: true,
    keys: ['metin', 'soru', 'kategoriAdi']
}

const islemlerListForSearch = [
    { icon: "icon-lightning.svg", url: "/elektrik-kesintisi-sorgulama", name: "Elektrik Kesintisi", keywords: ["Sorgulama", "Bağlantı", "Planlı Kesinti"] },
    { icon: "icon-priz.svg", url: "/elektrik-kesme-acma-basvuru", name: "Kesme - Açma - Hasta Var", keywords: ["Kontrol", "Yanlış kesme"] },
    { icon: "search-input-icon-yellow-16.svg", url: "/basvuru-takip", name: "Başvuru Takip", keywords: ["Sorgulama", "Sonuç"] },
    { icon: "icon-ariza.svg", url: "/ariza-bildir", name: "Arıza Bildirme", keywords: ["Arıza", "Sorun", "Problem", "Hizmet Bileti", "Kesinti", "Bölgede Evimde Elektrik Yok", "Sokak Lambası", "Aydınlatma Tehlikeli", "Direk TrafoHasar Kablo Tel Kopma Yangın"] },
    { icon: "search-input-icon-yellow-16.svg", url: "/endeks-islemleri-basvuru", name: "Endeks Girişi", keywords: ["Sorgulama", "Endeks ihbar"] },
    {
        icon: "icon-kacak.svg", url: "/kacak-islemleri", name: "Kaçak İşlemleri", keywords: ["Kaçak Durum Sorgulama", "Kaçak Elektrik İhbarı", "Kaçak Tutunağı Bedel Hesaplatma Başvuru", "Kaçak İşlemleri"] },
    { icon: "search-input-icon-yellow-16.svg", url: "/dagitim-alacaklari-borcu-sorgulama", name: "Dağıtım Alacakları Borç Sorgulama", keywords: ["Ödeme"] },
    { icon: "search-input-icon-yellow-16.svg", url: "/odeme-noktalari", name: "Ödeme Noktaları", keywords: ["Borç"] },
    { icon: "search-input-icon-yellow-16.svg", url: "/duyurular", name: "Duyurular", keywords: ["Haber", "ilan"] },
    { icon: "search-input-icon-yellow-16.svg", url: "/sayac-islemleri", name: "Sayaç İşlemleri", keywords: [] },
    //{ icon: "search-input-icon-yellow-16.svg", url: "/canli-yardim", name: "Canlı Yardım", keywords: ["Chat", "Asistan"] },
    { icon: "search-input-icon-yellow-16.svg", url: "/cagri-merkezi", name: "Çağrı Merkezi", keywords: ["Telefon numarası", "iletişim"] },
];
fuseStaticlist = new Fuse(islemlerListForSearch, options);

window.addEventListener('DOMContentLoaded', function () {
    var inp = document.querySelectorAll('input');
    for (var i = 0; i < inp.length; i++) {
        inp[i].addEventListener('change', function () {
            this.setAttribute("data-value", this.value);
        });
        if (inp[i].value) {
            inp[i].setAttribute("data-value", inp[i].value);
        }
    }
});

$('input').on('blur', function () {
    this.setAttribute("data-value", this.value);
});

if ($(window).width() < 900) {
    $('.dropdown-black--user .dropdown-menu').removeClass('dropdown-menu-left').addClass('dropdown-menu-right');
}

if (('ontouchstart' in window || (window.DocumentTouch && document instanceof DocumentTouch))) {
    $(".search-input-focus")
        .bind("touchstart", function () {
            var _this = $(this);
            setTimeout(function () {
                _this
                    .addClass("active");
            }, 50);

        })
}

$('.collapse').on('show.bs.collapse', function () {
    let ths = $(this);
    setTimeout(function () {
        var panel = $(ths).closest('.card');
        if (panel) {
            $('html, body').animate({
                scrollTop: panel.offset().top - 40
            }, 500);
        }
    }, 200);

});


//firefox safari line-clamp fix
$(document).ready(function () {
    $('.line-clamp-1, .line-clamp-2, .line-clamp-3, .line-clamp-5, .line-clamp-11').children().not('button').not(':first-child').remove();
});

$('.filter-box-left').click(function () {
    filterBoxLeftHeight();
});
filterBoxLeftHeight();

function filterBoxLeftHeight() {
    setTimeout(function () {
        var height = $('.filter-box-left').outerHeight()
        $('.filter-box-left').css('background', 'red !important');
        $('head').append('<style>.filter-box-left:before{min-height: ' + height + 'px !important;}</style>');
    }, 10);
}

$('#dropdownMenuButton').click(function () {
    $('body').addClass('body-loading');
});
$('.mobile-menu-header .close').click(function () {
    $('body').removeClass('body-loading');
});

$('textarea').on("input", function () {
    var maxLength = $(this).attr("maxlength");
    var currentLength = $(this).val().length;
    $(this).siblings('.char_count_js')[0].innerHTML = currentLength + "/" + maxLength;
    if (currentLength >= maxLength) {
        return console.log("max karakter limiti");
    }
});

function SetCerezAccepted(mandatory, functional, performance, domain) {
    Cookies.remove('cerez_accepted_v1', { domain: domain });
    Cookies.set('cerez_accepted_v1', "{mandatory:" + mandatory + ",functional:" + functional + ",performance:" + performance + "}", { expires: 365, secure: true, domain: domain });
    $('.footer_cerezpolitikasi').hide();
}

function htmlEncode(str) {
    return String(str).replace(/[^\w. ıİğĞüÜşŞöÖçÇ]/gi, function (c) {
        return '&#' + c.charCodeAt(0) + ';';
    });
}