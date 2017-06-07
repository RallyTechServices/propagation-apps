Ext.define('Rally.ui.menu.bulk.Cancel', {
    alias: 'widget.rallyrecordmenuitembulkcancel',
    extend: 'Rally.ui.menu.bulk.MenuItem',

    mixins: {
        messageable: 'Rally.Messageable'
    },

    config: {
        onBeforeAction: function(){
//            console.log('onbeforeaction');
        },

        /**
         * @cfg {Function} onActionComplete a function called when the specified menu item action has completed
         * @param Rally.data.wsapi.Model[] onActionComplete.successfulRecords any successfully modified records
         * @param Rally.data.wsapi.Model[] onActionComplete.unsuccessfulRecords any records which failed to be updated
         */
        onActionComplete: function(){
            //         console.log('onActionComplete');
        },
        text: 'Cancel',

       handler: function () {
           this.cancelRecords(this.records, null);
       },
       predicate: function (records) {
           return _.every(records, function (record) {
               var thisRecordType = record.get('_type').toLowerCase();
               return (/portfolioitem/.test(thisRecordType));
           });
       }
    },
    _cancelRecord: function(record){
        var deferred = Ext.create('Deft.Deferred');
        var fid = record.get('FormattedID');
        var me = this;

        this.fireEvent('loadtree');
        me.publish('maskUpdate', 'Retrieving Data...');

        var artifactTree = Ext.create('Rally.technicalservices.ArtifactTree',{
            portfolioItemTypes: this.portfolioItemTypes,
            portfolioItemCanceledStates: this.portfolioItemCanceledStates,
            canceledReleaseHash: this.canceledReleaseHash,
            canceledScheduleState: this.canceledScheduleState,
            canceledPrefix: this.canceledPrefix,
            completedStates: this.completedStates,
            listeners: {
                treeloaded: function(tree){
                    me.publish('maskUpdate', 'Cancelling Items...');
                    tree.cancelItems();
                },
                completed: function(rootRecord){
                   // me.fireEvent('copycomplete');
                    me.publish('maskUpdate');
                    deferred.resolve({record: record});
                },
                error: function(errorMsg){
                  //  me.fireEvent('copyerror',{record: record, errorMessage: errorMsg});
                    me.publish('maskUpdate');
                    deferred.resolve({record: record, errorMessage: errorMsg});
                },
                scope: this
            }
        });

        artifactTree.load(record);

        return deferred;
    },
    cancelRecords: function(records){
        var promises= [],
            successfulRecords = [],
            unsuccessfulRecords = [];

        _.each(records, function(r){
            promises.push(function() {
                return this._cancelRecord(r);
            });
        }, this);

        Deft.Chain.sequence(promises, this).then({
            success: function(results){
                var errorMessage = '';
                _.each(results, function(r){
                    if (r.errorMessage){
                        errorMessage = r.errorMessage;
                        unsuccessfulRecords.push(r.record);
                    } else {
                        successfulRecords.push(r.record);
                    }
                });

                this.onSuccess(successfulRecords, unsuccessfulRecords, {}, errorMessage);
            },
            failure: function(msg){

                this.onSuccess([], [], {}, msg);
            },
            scope: this
        });

    },
    onSuccess: function (successfulRecords, unsuccessfulRecords, args, errorMessage) {

        var message = successfulRecords.length + (successfulRecords.length === 1 ? ' item has ' : ' items have ');

        if(successfulRecords.length === this.records.length) {
            message = message + ' been canceled';

            this.publish('bulkActionComplete', message);
            //Rally.ui.notify.Notifier.show({
            //    message: message
            //});
        } else {
            if (successfulRecords.length === 0){
                message = "0 items have been canceled";
            }

            this.publish('bulkActionError', message + ', but ' + unsuccessfulRecords.length + ' failed: ' + errorMessage);
            //Rally.ui.notify.Notifier.showError({
            //    message: message + ', but ' + unsuccessfulRecords.length + ' failed: ' + errorMessage,
            //    saveDelay: 500
            //});
        }

        Ext.callback(this.onActionComplete, null, [successfulRecords, unsuccessfulRecords]);
    }
});
