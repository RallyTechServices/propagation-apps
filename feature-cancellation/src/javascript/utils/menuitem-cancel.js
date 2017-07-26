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

         Ext.create('Rally.ui.dialog.ConfirmDialog', {
             message: Ext.String.format('Are you sure you would like to cancel {0} work items? All child items that are not marked complete will also be cancelled.',this.records.length),
             confirmLabel: 'Yes, Proceed',
             cancelLabel: 'No',
             title: 'Cancel Artifacts?',
             listeners: {
                 confirm: function(){
                   this.cancelRecords(this.records, null);
                 },
                 cancel: function(){
                   this.onSuccess([], [], {}, "", []);
                 },
                 scope: this
             }
         });

       },
       predicate: function (records) {
         var completedStates = this.completedStates;

           return _.every(records, function (record) {
               var thisRecordType = record.get('_type').toLowerCase();
               var state = null;

               if (thisRecordType === 'hierarchicalrequirement'){
                 state = record.get('ScheduleState');
               } else {
                 state = record.get('State') && record.get('State')._ref;

               }
               var isCompleted = Ext.Array.contains(completedStates, state);
               if (isCompleted){
                 return false;
               }
               return (/portfolioitem/.test(thisRecordType) || /hierarchicalrequirement/.test(thisRecordType));
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
                completed: function(batch){
                   // me.fireEvent('copycomplete');
                    me.publish('maskUpdate');
                    deferred.resolve({
                        record: record,
                        batch: batch
                    });
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
            successfulRootRecords = [],
            unsuccessfulRecords = [],
            allRecords = [];



            // successfulRootRecords are the just the ones selected directly.
            // allRecords include the children found by the batch process
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
                        successfulRootRecords.push(r.record);
                        if ( r.batch && r.batch.operations && r.batch.operations.length > 0 ) {
                            Ext.Array.push(allRecords,r.batch.operations[0].records);
                        }
                    }
                });
                this.onSuccess(successfulRootRecords, unsuccessfulRecords, {}, errorMessage, allRecords);
            },
            failure: function(msg){
                this.onSuccess([], records, {}, msg, []);
            },
            scope: this
        });

    },
    onSuccess: function (successfulRecords, unsuccessfulRecords, args, errorMessage, allRecords) {

        var message = successfulRecords.length + (successfulRecords.length === 1 ? ' item has ' : ' items have ');

        if(successfulRecords.length === this.records.length) {
            message = message + ' been canceled';
            this.publish('bulkActionComplete', message, true, successfulRecords, allRecords);
            //Rally.ui.notify.Notifier.show({
            //    message: message
            //});
        } else {
            if (successfulRecords.length === 0){
                message = "0 items have been canceled";
            }

            if (unsuccessfulRecords.length === 0){
              this.publish('bulkActionComplete', message + '.  Cancellation aborted by user.',[]);
            } else {
              this.publish('bulkActionError', message + ', but ' + unsuccessfulRecords.length + ' failed: ' + errorMessage,[]);
            }
        }

        Ext.callback(this.onActionComplete, null, [successfulRecords, unsuccessfulRecords]);
    }
});
